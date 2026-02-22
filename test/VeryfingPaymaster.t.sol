// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/core/VerifyingPaymaster.sol";
import "../src/mock/MockToken.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@account-abstraction/contracts/core/Helpers.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

// Harness exposes internal functions for testing
contract PaymasterHarness is RootstockVerifyingPaymaster {
    constructor(IEntryPoint _ep, address _owner, address _signer, IERC20 _token)
        RootstockVerifyingPaymaster(_ep, _owner, _signer, _token) {}

    function testValidate(PackedUserOperation calldata op, bytes32 hash, uint256 preFund)
        external returns (bytes memory context, uint256 validationData) {
        return _validatePaymasterUserOp(op, hash, preFund);
    }
}

contract VerifyingPaymasterTest is Test {
    PaymasterHarness public paymaster;
    MockToken public token;
    
    address public signer;
    uint256 public signerKey;
    address public user;
    address public entryPointMock = address(0x999);

    function setUp() public {
        (signer, signerKey) = makeAddrAndKey("signer");
        user = makeAddr("user");

        token = new MockToken();

        // BasePaymaster constructor validates EntryPoint via supportsInterface. Mock it for address(0x999).
        vm.mockCall(
            entryPointMock,
            abi.encodeWithSelector(IERC165.supportsInterface.selector, type(IEntryPoint).interfaceId),
            abi.encode(true)
        );

        paymaster = new PaymasterHarness(IEntryPoint(entryPointMock), address(this), signer, IERC20(address(token)));

        // Setup user tokens
        token.mint(user, 1000 * 10**18);
        vm.prank(user);
        token.approve(address(paymaster), type(uint256).max);
    }

    function test_ValidSignature() public {
        PackedUserOperation memory op;
        op.sender = user;
        op.nonce = 0;
        op.initCode = "";
        op.callData = "";
        op.accountGasLimits = bytes32(uint256(100000) << 128 | 100000);
        op.preVerificationGas = 50000;
        op.gasFees = bytes32(uint256(1e9) << 128 | 1e9);

        uint48 validUntil = uint48(block.timestamp + 300);
        uint48 validAfter = uint48(block.timestamp);
        uint128 verificationGasLimit = 100000;
        uint128 postOpGasLimit = 100000;
        bytes memory placeholderSig = new bytes(65);
        op.paymasterAndData = abi.encodePacked(
            address(paymaster),
            verificationGasLimit,
            postOpGasLimit,
            validUntil,
            validAfter,
            placeholderSig
        );

        bytes32 hash = paymaster.getHash(op, validUntil, validAfter);
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(hash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        op.paymasterAndData = abi.encodePacked(
            address(paymaster),
            verificationGasLimit,
            postOpGasLimit,
            validUntil,
            validAfter,
            signature
        );

        (bytes memory context, uint256 validationData) = paymaster.testValidate(op, bytes32(0), 1000);

        // Success = aggregator 0 (lower 160 bits). Full validationData packs validUntil/validAfter.
        assertTrue(validationData != SIG_VALIDATION_FAILED, "signature must not fail");
        assertEq(uint160(validationData), 0, "aggregator must be 0 for success");
    }
}