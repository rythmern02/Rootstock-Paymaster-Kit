// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/core/VerifyingPaymaster.sol";
import "../src/mock/MockToken.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import "@account-abstraction/contracts/core/Helpers.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

// ─── Harness ─────────────────────────────────────────────────────────────────

/**
 * @dev Exposes internal functions so tests can call them directly without
 *      needing a full EntryPoint.
 */
contract PaymasterHarness is RootstockVerifyingPaymaster {
    constructor(
        IEntryPoint _ep,
        address _owner,
        address _signer,
        IERC20 _token
    ) RootstockVerifyingPaymaster(_ep, _owner, _signer, _token) {}

    function testValidate(
        PackedUserOperation calldata op,
        bytes32 hash,
        uint256 preFund
    ) external returns (bytes memory context, uint256 validationData) {
        return _validatePaymasterUserOp(op, hash, preFund);
    }

    function testPostOp(
        IPaymaster.PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 actualUserOpFeePerGas
    ) external {
        _postOp(mode, context, actualGasCost, actualUserOpFeePerGas);
    }
}

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * @dev Shared test helpers for building mock UserOps and paymaster data.
 */
contract PaymasterTestBase is Test {
    PaymasterHarness public paymaster;
    MockToken public token;

    address public owner;
    address public signer;
    uint256 public signerKey;
    address public user;
    address public entryPointMock = address(0x999);

    function setUp() public virtual {
        owner = makeAddr("owner");
        (signer, signerKey) = makeAddrAndKey("signer");
        user = makeAddr("user");

        token = new MockToken();

        // BasePaymaster validates EntryPoint supportsInterface — mock it.
        vm.mockCall(
            entryPointMock,
            abi.encodeWithSelector(
                IERC165.supportsInterface.selector,
                type(IEntryPoint).interfaceId
            ),
            abi.encode(true)
        );

        paymaster = new PaymasterHarness(
            IEntryPoint(entryPointMock),
            owner,
            signer,
            IERC20(address(token))
        );

        // Give user tokens and approve the paymaster.
        // Since MockToken is Ownable and this contract is the deployer/owner:
        token.mint(user, 10_000 * 1e18);
        vm.prank(user);
        token.approve(address(paymaster), type(uint256).max);
    }

    /// @dev Build a minimal valid PackedUserOperation for testing.
    function _buildOp(
        address sender,
        uint48 validUntil,
        uint48 validAfter,
        bytes memory sig
    ) internal view returns (PackedUserOperation memory op) {
        op.sender = sender;
        op.nonce = 0;
        op.initCode = "";
        op.callData = "";
        op.accountGasLimits = bytes32((uint256(100_000) << 128) | 100_000);
        op.preVerificationGas = 50_000;
        op.gasFees = bytes32((uint256(1e9) << 128) | 1e9);

        uint128 verificationGasLimit = 100_000;
        uint128 postOpGasLimit = 100_000;
        op.paymasterAndData = abi.encodePacked(
            address(paymaster),
            verificationGasLimit,
            postOpGasLimit,
            validUntil,
            validAfter,
            sig
        );
    }

    /// @dev Sign a paymaster hash with the given key and return the full paymasterAndData.
    function _signOp(
        PackedUserOperation memory op,
        uint48 validUntil,
        uint48 validAfter,
        uint256 key
    ) internal view returns (PackedUserOperation memory) {
        bytes32 hash = paymaster.getHash(op, validUntil, validAfter);
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(hash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, ethHash);
        bytes memory sig = abi.encodePacked(r, s, v);

        uint128 verificationGasLimit = 100_000;
        uint128 postOpGasLimit = 100_000;
        op.paymasterAndData = abi.encodePacked(
            address(paymaster),
            verificationGasLimit,
            postOpGasLimit,
            validUntil,
            validAfter,
            sig
        );
        return op;
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

contract VerifyingPaymasterBugsTest is PaymasterTestBase {
    // ── Bug #1 — _postOp override + 4-param signature ─────────────────────

    /**
     * @notice Bug #1: Verifies that _postOp can be called with 4 parameters.
     *         Before the fix, the function had no `override` and only 3 params,
     *         so the EntryPoint would never call it (wrong function selector).
     */
    function test_Bug1_PostOpAcceptsFourParams() public {
        // Build minimal context.
        bytes memory context = abi.encode(
            user,
            uint256(1000 * 1e18),
            uint256(1e6)
        );

        // The 4th param actualUserOpFeePerGas must be accepted without revert.
        // If the old 3-param signature were still in use, calling this 4-param
        // harness would fail to compile / would not be the overridden function.
        uint256 balBefore = token.balanceOf(user);
        paymaster.testPostOp(IPaymaster.PostOpMode.opSucceeded, context, 0, 0);
        // actualGasCost=0 means 0 tokens charged — balance unchanged.
        assertEq(
            token.balanceOf(user),
            balBefore,
            "Bug1: zero cost should charge nothing"
        );
    }

    // ── Bug #4 — Replay protection via paymasterNonce ────────────────────

    /**
     * @notice Bug #4: paymasterNonces[sender] is included in getHash, preventing
     *         replay of a paymaster signature within the validity window.
     *         Two calls with the same op parameters should produce different hashes
     *         because the nonce increments after the first validation.
     */
    function test_Bug4_ReplayProtectionNonceIncrements() public {
        uint48 validUntil = uint48(block.timestamp + 300);
        uint48 validAfter = 0;

        // Nonce starts at 0.
        assertEq(paymaster.paymasterNonces(user), 0);

        PackedUserOperation memory op = _buildOp(
            user,
            validUntil,
            validAfter,
            new bytes(65)
        );
        op = _signOp(op, validUntil, validAfter, signerKey);

        // First validation — succeeds, increments nonce.
        (bytes memory context, uint256 vd) = paymaster.testValidate(
            op,
            bytes32(0),
            1000
        );
        assertEq(uint160(vd), 0, "Bug4: first validation should succeed");
        assertEq(
            paymaster.paymasterNonces(user),
            1,
            "Bug4: nonce must increment"
        );

        // Rebuild op with same params — the signature was computed for nonce=0,
        // but now the on-chain nonce is 1, so the hash differs → SIG_VALIDATION_FAILED.
        PackedUserOperation memory op2 = _buildOp(
            user,
            validUntil,
            validAfter,
            new bytes(65)
        );
        op2 = _signOp(op2, validUntil, validAfter, signerKey);
        // Note: _signOp reads paymasterNonces which is now 1, so this is a NEW valid sig.
        // To test old-sig replay: manually use the same paymasterAndData from op in op2.
        op2.paymasterAndData = op.paymasterAndData; // stale signature for nonce=0

        (, uint256 vd2) = paymaster.testValidate(op2, bytes32(0), 1000);
        assertEq(vd2, SIG_VALIDATION_FAILED, "Bug4: replayed sig must fail");
    }

    /**
     * @notice Bug #4: Two UserOps with the different nonces produce different hashes.
     */
    function test_Bug4_DifferentNoncesProduceDifferentHashes() public {
        uint48 validUntil = uint48(block.timestamp + 300);
        uint48 validAfter = 0;

        PackedUserOperation memory op1 = _buildOp(
            user,
            validUntil,
            validAfter,
            new bytes(65)
        );
        bytes32 hash1 = paymaster.getHash(op1, validUntil, validAfter);

        // Simulate nonce increment.
        // Build op2 after first validation increments the nonce.
        op1 = _signOp(op1, validUntil, validAfter, signerKey);
        paymaster.testValidate(op1, bytes32(0), 1000); // nonce → 1

        PackedUserOperation memory op2 = _buildOp(
            user,
            validUntil,
            validAfter,
            new bytes(65)
        );
        bytes32 hash2 = paymaster.getHash(op2, validUntil, validAfter);

        assertTrue(
            hash1 != hash2,
            "Bug4: hashes must differ after nonce increment"
        );
    }

    // ── Bug #5 — Zero exchange rate reverts ───────────────────────────────

    /**
     * @notice Bug #5: setExchangeRate(0) must revert to prevent free sponsorship.
     */
    function test_Bug5_SetExchangeRateZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(bytes("PM: rate below minimum"));
        paymaster.setExchangeRate(0);
    }

    // ── Bug #7 — Rate bounds and event emission ───────────────────────────

    /**
     * @notice Bug #7: Setting a rate below MIN_RATE must revert.
     */
    function test_Bug7_SetExchangeRateBelowMinReverts() public {
        // Cache the constant BEFORE prank/expectRevert to avoid consuming the expectRevert.
        uint256 belowMin = paymaster.MIN_RATE() - 1;
        vm.prank(owner);
        vm.expectRevert(bytes("PM: rate below minimum"));
        paymaster.setExchangeRate(belowMin);
    }

    /**
     * @notice Bug #7: Setting a rate above MAX_RATE must revert.
     */
    function test_Bug7_SetExchangeRateAboveMaxReverts() public {
        // Cache the constant BEFORE prank/expectRevert to avoid consuming the expectRevert.
        uint256 aboveMax = paymaster.MAX_RATE() + 1;
        vm.prank(owner);
        vm.expectRevert(bytes("PM: rate above maximum"));
        paymaster.setExchangeRate(aboveMax);
    }

    /**
     * @notice Bug #7: A valid rate update must emit ExchangeRateUpdated.
     */
    function test_Bug7_SetExchangeRateEmitsEvent() public {
        uint256 oldRate = paymaster.exchangeRate();
        uint256 newRate = 2 * 10 ** 6;

        vm.prank(owner);
        vm.expectEmit(true, true, false, false);
        emit RootstockVerifyingPaymaster.ExchangeRateUpdated(oldRate, newRate);
        paymaster.setExchangeRate(newRate);

        assertEq(paymaster.exchangeRate(), newRate, "Bug7: rate must update");
    }

    /**
     * @notice Bug #7: Only owner can set exchange rate.
     */
    function test_Bug7_OnlyOwnerCanSetRate() public {
        vm.prank(user);
        vm.expectRevert();
        paymaster.setExchangeRate(2 * 10 ** 6);
    }

    // ── Bug #14 — postOpReverted handling ────────────────────────────────

    /**
     * @notice Bug #14: When mode=postOpReverted, _postOp must not revert.
     *         It should attempt to charge the user (via try/catch) and emit an event.
     */
    function test_Bug14_PostOpRevertedDoesNotRevert() public {
        bytes memory context = abi.encode(
            user,
            uint256(1000 * 1e18),
            paymaster.exchangeRate()
        );

        // Even if called in postOpReverted mode, must not revert.
        paymaster.testPostOp(
            IPaymaster.PostOpMode.postOpReverted,
            context,
            500_000,
            1e9
        );
    }

    /**
     * @notice Bug #14: In postOpReverted mode, if the user has tokens/allowance,
     *         they should still pay for gas consumed.
     */
    function test_Bug14_PostOpRevertedChargesGas() public {
        uint256 rate = paymaster.exchangeRate();
        uint256 actualGasCost = 100_000; // small cost
        uint256 maxTokenCost = 1000 * 1e18;
        bytes memory context = abi.encode(user, maxTokenCost, rate);

        uint256 balBefore = token.balanceOf(user);
        paymaster.testPostOp(
            IPaymaster.PostOpMode.postOpReverted,
            context,
            actualGasCost,
            1e9
        );
        uint256 balAfter = token.balanceOf(user);

        uint256 expectedCharge = (actualGasCost * rate) /
            paymaster.PRICE_DENOMINATOR();
        assertEq(
            balBefore - balAfter,
            expectedCharge,
            "Bug14: charge in postOpReverted must match actual gas"
        );
    }

    /**
     * @notice Bug #14: postOpReverted with user having NO tokens must not revert
     *         (paymaster absorbs the loss silently via try/catch).
     */
    function test_Bug14_PostOpRevertedWithNoTokensDoesNotRevert() public {
        address poorUser = makeAddr("poorUser");
        // poorUser has 0 tokens and 0 allowance.
        bytes memory context = abi.encode(
            poorUser,
            uint256(1000 * 1e18),
            paymaster.exchangeRate()
        );

        // Must not revert even though the token transfer would fail.
        paymaster.testPostOp(
            IPaymaster.PostOpMode.postOpReverted,
            context,
            100_000,
            1e9
        );
    }

    // ── Bug #15 — No token transfer in validation phase ──────────────────

    /**
     * @notice Bug #15: _validatePaymasterUserOp must NOT transfer tokens.
     *         The user's balance should be unchanged after validation.
     *         Token charging is deferred to _postOp.
     */
    function test_Bug15_ValidationPhaseNoTokenTransfer() public {
        uint48 validUntil = uint48(block.timestamp + 300);
        uint48 validAfter = 0;

        PackedUserOperation memory op = _buildOp(
            user,
            validUntil,
            validAfter,
            new bytes(65)
        );
        op = _signOp(op, validUntil, validAfter, signerKey);

        uint256 balBefore = token.balanceOf(user);
        paymaster.testValidate(op, bytes32(0), 1_000_000);
        uint256 balAfter = token.balanceOf(user);

        assertEq(
            balBefore,
            balAfter,
            "Bug15: token balance must not change during validation"
        );
    }

    /**
     * @notice Bug #15: After _postOp(opSucceeded), tokens ARE charged correctly.
     */
    function test_Bug15_PostOpChargesTokens() public {
        uint256 rate = paymaster.exchangeRate();
        uint256 actualGasCost = 200_000;
        uint256 maxTokenCost = 10_000 * 1e18;
        bytes memory context = abi.encode(user, maxTokenCost, rate);

        uint256 balBefore = token.balanceOf(user);
        paymaster.testPostOp(
            IPaymaster.PostOpMode.opSucceeded,
            context,
            actualGasCost,
            1e9
        );
        uint256 balAfter = token.balanceOf(user);

        uint256 expectedCharge = (actualGasCost * rate) /
            paymaster.PRICE_DENOMINATOR();
        assertEq(
            balBefore - balAfter,
            expectedCharge,
            "Bug15: postOp must charge correct token amount"
        );
    }

    /**
     * @notice Bug #15: postOp charges are capped at maxTokenCost, never exceeding
     *         the declared maximum (protects user against accounting errors).
     */
    function test_Bug15_PostOpCapsAtMaxTokenCost() public {
        uint256 rate = paymaster.exchangeRate();
        // Make actualGasCost so large that actualTokenCost > maxTokenCost.
        uint256 maxTokenCost = 100; // tiny cap
        uint256 actualGasCost = 1e30; // enormous actual cost
        bytes memory context = abi.encode(user, maxTokenCost, rate);

        // Give user exactly maxTokenCost tokens to confirm cap is respected.
        deal(address(token), user, maxTokenCost);
        vm.prank(user);
        token.approve(address(paymaster), type(uint256).max);

        uint256 balBefore = token.balanceOf(user);
        paymaster.testPostOp(
            IPaymaster.PostOpMode.opSucceeded,
            context,
            actualGasCost,
            1e9
        );
        uint256 balAfter = token.balanceOf(user);

        assertEq(
            balBefore - balAfter,
            maxTokenCost,
            "Bug15: charge must be capped at maxTokenCost"
        );
    }

    // ── Bug #17 — MockToken mint access control ───────────────────────────

    /**
     * @notice Bug #17: MockToken.mint() must revert for non-owners.
     */
    function test_Bug17_MockTokenMintOnlyOwner() public {
        vm.prank(user); // user is NOT the owner
        vm.expectRevert();
        token.mint(user, 1e18);
    }

    /**
     * @notice Bug #17: MockToken.mint() succeeds for the owner.
     */
    function test_Bug17_MockTokenOwnerCanMint() public {
        // This test contract deployed MockToken, so it (address(this)) is the owner.
        uint256 balBefore = token.balanceOf(user);
        token.mint(user, 500 * 1e18);
        assertEq(token.balanceOf(user) - balBefore, 500 * 1e18);
    }

    // ── Bug #25 — Owner and signer must differ ────────────────────────────

    /**
     * @notice Bug #25: Constructor must revert when owner == verifyingSigner.
     */
    function test_Bug25_OwnerAndSignerMustDiffer() public {
        vm.expectRevert(bytes("PM: owner and signer must differ"));
        new PaymasterHarness(
            IEntryPoint(entryPointMock),
            signer, // owner == signer → must revert
            signer,
            IERC20(address(token))
        );
    }

    /**
     * @notice Bug #25: setVerifyingSigner must revert if new signer == owner.
     */
    function test_Bug25_SetVerifyingSignerCannotBeOwner() public {
        vm.prank(owner);
        vm.expectRevert(bytes("PM: signer must differ from owner"));
        paymaster.setVerifyingSigner(owner);
    }

    // ── Existing regression — valid signature still passes ────────────────

    /**
     * @notice Regression: A correctly signed op still validates successfully
     *         after all the above fixes are applied.
     */
    function test_Regression_ValidSignatureStillPasses() public {
        uint48 validUntil = uint48(block.timestamp + 300);
        uint48 validAfter = 0;

        PackedUserOperation memory op = _buildOp(
            user,
            validUntil,
            validAfter,
            new bytes(65)
        );
        op = _signOp(op, validUntil, validAfter, signerKey);

        (, uint256 validationData) = paymaster.testValidate(
            op,
            bytes32(0),
            1000
        );

        assertTrue(
            validationData != SIG_VALIDATION_FAILED,
            "regression: valid sig must pass"
        );
        assertEq(
            uint160(validationData),
            0,
            "regression: aggregator must be zero"
        );
    }

    /**
     * @notice Regression: A wrong signer produces SIG_VALIDATION_FAILED.
     */
    function test_Regression_WrongSignerFails() public {
        uint48 validUntil = uint48(block.timestamp + 300);
        uint48 validAfter = 0;
        (, uint256 wrongKey) = makeAddrAndKey("wrongSigner");

        PackedUserOperation memory op = _buildOp(
            user,
            validUntil,
            validAfter,
            new bytes(65)
        );
        op = _signOp(op, validUntil, validAfter, wrongKey); // wrong key

        (, uint256 validationData) = paymaster.testValidate(
            op,
            bytes32(0),
            1000
        );
        assertEq(
            validationData,
            SIG_VALIDATION_FAILED,
            "regression: wrong sig must fail"
        );
    }
}
