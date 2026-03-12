// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "@account-abstraction/contracts/core/BasePaymaster.sol";
import "@account-abstraction/contracts/core/UserOperationLib.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@account-abstraction/contracts/core/Helpers.sol";

/**
 * @title RootstockVerifyingPaymaster
 * @notice A production-ready ERC-4337 v0.7 Verifying Paymaster for the Rootstock network.
 *         Users pay for gas in an ERC-20 token (e.g. rUSD) instead of RBTC.
 *
 * Security model:
 *  - Off-chain signer authorises each UserOp within a time window.
 *  - Per-sender paymasterNonce prevents within-window signature replay (Bug #4).
 *  - Tokens are charged in _postOp (not validation) to comply with ERC-4337
 *    bundler opcode restrictions (Bug #15).
 *  - Exchange rate changes are bounded and emit events (Bug #5, #7).
 *  - _postOp correctly handles the postOpReverted mode (Bug #14).
 */
contract RootstockVerifyingPaymaster is BasePaymaster {
    using UserOperationLib for PackedUserOperation;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using SafeERC20 for IERC20;

    // ─── State ───────────────────────────────────────────────────────────────

    address public verifyingSigner;
    IERC20 public immutable token;
    uint256 public exchangeRate;

    /// @notice Per-sender nonce to prevent paymaster-signature replay (Bug #4).
    mapping(address => uint256) public paymasterNonces;

    // ─── Constants ───────────────────────────────────────────────────────────

    /// @dev Denominator for exchange-rate fixed-point arithmetic (1e18).
    uint256 public constant PRICE_DENOMINATOR = 1e18;

    /**
     * @dev Lower bound prevents an operator from setting a near-zero rate that
     *      effectively sponsors every transaction for free (Bug #5, #7).
     */
    uint256 public constant MIN_RATE = 1e3;

    /**
     * @dev Upper bound prevents an operator from setting an astronomically high
     *      rate and overcharging users (Bug #7).
     */
    uint256 public constant MAX_RATE = 1e30;

    // ─── Events ──────────────────────────────────────────────────────────────

    event GasSponsored(
        address indexed sender,
        uint256 actualGasCost,
        uint256 tokenAmountCharged
    );

    /// @notice Emitted whenever the owner updates the exchange rate (Bug #7).
    event ExchangeRateUpdated(uint256 indexed oldRate, uint256 indexed newRate);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(
        IEntryPoint _entryPoint,
        address _owner,
        address _verifyingSigner,
        IERC20 _token
    ) BasePaymaster(_entryPoint) {
        // Bug #25: enforced upstream in the deploy script, but also sanity-check here.
        require(_owner != _verifyingSigner, "PM: owner and signer must differ");
        _transferOwnership(_owner);
        verifyingSigner = _verifyingSigner;
        token = _token;
        exchangeRate = 1 * 10 ** 6;
    }

    // ─── Hash ────────────────────────────────────────────────────────────────

    /**
     * @notice Compute the paymaster-specific hash that the signer must sign.
     *
     * Bug #4 fix: `paymasterNonces[sender]` is included so that each signed
     * payload can only be used once, even if the UserOp parameters are
     * identical to a previous op (e.g. a retried transaction within the same
     * validity window).
     *
     * v0.7 paymasterAndData layout:
     *   [0:20]   paymaster address
     *   [20:36]  verificationGasLimit (uint128, big-endian)
     *   [36:52]  postOpGasLimit       (uint128, big-endian)
     *   [52:58]  validUntil           (uint48,  big-endian)
     *   [58:64]  validAfter           (uint48,  big-endian)
     *   [64:129] signature            (65 bytes)
     */
    function getHash(
        PackedUserOperation calldata userOp,
        uint48 validUntil,
        uint48 validAfter
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    userOp.getSender(),
                    paymasterNonces[userOp.getSender()], // Bug #4: replay protection
                    userOp.nonce,
                    keccak256(userOp.initCode),
                    keccak256(userOp.callData),
                    userOp.accountGasLimits,
                    uint256(
                        bytes32(
                            userOp.paymasterAndData[UserOperationLib
                                .PAYMASTER_VALIDATION_GAS_OFFSET:UserOperationLib
                                .PAYMASTER_DATA_OFFSET]
                        )
                    ),
                    userOp.preVerificationGas,
                    userOp.gasFees,
                    block.chainid,
                    address(this),
                    validUntil,
                    validAfter
                )
            );
    }

    // ─── Validation ──────────────────────────────────────────────────────────

    /**
     * @dev Called by EntryPoint during the validation phase.
     *
     * Bug #15 fix: NO token transfer happens here. Accessing external ERC-20
     * storage during validation violates ERC-4337 opcode restrictions and
     * causes strict bundlers to reject the UserOp. Tokens are charged in
     * _postOp instead.
     */
    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 /* userOpHash */,
        uint256 requiredPreFund
    ) internal override returns (bytes memory context, uint256 validationData) {
        require(
            userOp.paymasterAndData.length >= 129,
            "PM: invalid data length"
        );

        uint48 validUntil = uint48(bytes6(userOp.paymasterAndData[52:58]));
        uint48 validAfter = uint48(bytes6(userOp.paymasterAndData[58:64]));
        bytes calldata signature = userOp.paymasterAndData[64:129];

        bytes32 hash = getHash(userOp, validUntil, validAfter)
            .toEthSignedMessageHash();
        if (verifyingSigner != hash.recover(signature)) {
            return ("", SIG_VALIDATION_FAILED);
        }

        // Increment nonce so this paymaster signature cannot be replayed (Bug #4).
        paymasterNonces[userOp.getSender()]++;

        // Calculate the maximum possible token cost for the postOp context.
        // Bug #15: We do NOT transfer here — only record the max cost.
        uint256 maxTokenCost = (requiredPreFund * exchangeRate) /
            PRICE_DENOMINATOR;

        context = abi.encode(userOp.getSender(), maxTokenCost, exchangeRate);
        return (context, _packValidationData(false, validUntil, validAfter));
    }

    // ─── Post-Op ─────────────────────────────────────────────────────────────

    /**
     * @dev Called by EntryPoint after UserOp execution.
     *
     * Bug #1 fix:  Added `override` keyword.
     * Bug #1 fix:  Added 4th parameter `actualUserOpFeePerGas` (ERC-4337 v0.7).
     * Bug #14 fix: `postOpReverted` mode is now handled — tokens are still
     *              charged for gas consumed, but we never revert in this branch
     *              (a revert here would cause the entire handleOps to fail).
     * Bug #15 fix: All token charging is done here, not in validation.
     */
    function _postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 /* actualUserOpFeePerGas */ // Bug #1: 4th param per ERC-4337 v0.7
    ) internal override {
        (address sender, uint256 maxTokenCost, uint256 rate) = abi.decode(
            context,
            (address, uint256, uint256)
        );

        uint256 actualTokenCost = (actualGasCost * rate) / PRICE_DENOMINATOR;
        // Cap at maxTokenCost so we never overcharge relative to what we declared.
        uint256 chargeAmount = actualTokenCost < maxTokenCost
            ? actualTokenCost
            : maxTokenCost;

        if (mode == PostOpMode.postOpReverted) {
            // Bug #14: The inner UserOp call (or our first postOp attempt) reverted.
            // This handler MUST NOT revert — a revert here collapses handleOps.
            // We still attempt to collect gas costs from the user via try/catch.
            if (chargeAmount > 0) {
                // solhint-disable-next-line no-empty-blocks
                try token.transferFrom(sender, address(this), chargeAmount) {
                    emit GasSponsored(sender, actualGasCost, chargeAmount);
                } catch {
                    // User has insufficient tokens/allowance.
                    // Paymaster absorbs the loss for this operation.
                    emit GasSponsored(sender, actualGasCost, 0);
                }
            }
        } else {
            // Normal execution path (opSucceeded or opUnused).
            // safeTransferFrom reverts on failure, which causes the EntryPoint
            // to re-invoke postOp with mode=postOpReverted (handled above).
            if (chargeAmount > 0) {
                token.safeTransferFrom(sender, address(this), chargeAmount);
            }
            emit GasSponsored(sender, actualGasCost, chargeAmount);
        }
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    /**
     * @notice Update the token/gas exchange rate.
     *
     * Bug #5 fix: Reverts if _newRate is zero (would make all ops free).
     * Bug #7 fix: Enforces MIN_RATE and MAX_RATE bounds, emits ExchangeRateUpdated.
     */
    function setExchangeRate(uint256 _newRate) external onlyOwner {
        require(_newRate >= MIN_RATE, "PM: rate below minimum"); // Bug #5 + #7
        require(_newRate <= MAX_RATE, "PM: rate above maximum"); // Bug #7
        uint256 oldRate = exchangeRate;
        exchangeRate = _newRate;
        emit ExchangeRateUpdated(oldRate, _newRate); // Bug #7
    }

    /// @notice Update the verifying signer address.
    function setVerifyingSigner(address _newSigner) external onlyOwner {
        require(_newSigner != address(0), "PM: zero signer");
        require(_newSigner != owner(), "PM: signer must differ from owner");
        verifyingSigner = _newSigner;
    }

    /// @notice Withdraw ERC-20 tokens from the paymaster balance.
    function withdrawToken(address to, uint256 amount) external onlyOwner {
        token.safeTransfer(to, amount);
    }
}
