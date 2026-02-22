// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "@account-abstraction/contracts/core/BasePaymaster.sol";
import "@account-abstraction/contracts/core/UserOperationLib.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@account-abstraction/contracts/core/Helpers.sol";

contract RootstockVerifyingPaymaster is BasePaymaster {
    using UserOperationLib for PackedUserOperation;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using SafeERC20 for IERC20;

    address public verifyingSigner;
    IERC20 public immutable token;
    uint256 public exchangeRate; 
    
    // Constant for the decimals of the exchange rate (e.g., 1e18)
    uint256 public constant PRICE_DENOMINATOR = 1e18;

    event GasSponsored(address indexed sender, uint256 actualGasCost, uint256 tokenAmountCharged);

    constructor(
        IEntryPoint _entryPoint,
        address _owner,
        address _verifyingSigner,
        IERC20 _token
    ) BasePaymaster(_entryPoint) {
        _transferOwnership(_owner);
        verifyingSigner = _verifyingSigner;
        token = _token;
        exchangeRate = 1 * 10**6; 
    }

    /**
     * @dev Return the hash to sign off-chain. Excludes signature to avoid circular dependency.
     * Must match off-chain computation in paymasterService.ts
     */
    function getHash(
        PackedUserOperation calldata userOp,
        uint48 validUntil,
        uint48 validAfter
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                userOp.getSender(),
                userOp.nonce,
                keccak256(userOp.initCode),
                keccak256(userOp.callData),
                userOp.accountGasLimits,
                uint256(bytes32(userOp.paymasterAndData[UserOperationLib.PAYMASTER_VALIDATION_GAS_OFFSET:UserOperationLib.PAYMASTER_DATA_OFFSET])),
                userOp.preVerificationGas,
                userOp.gasFees,
                block.chainid,
                address(this),
                validUntil,
                validAfter
            )
        );
    }

    /**
     * @dev v0.7 paymasterAndData layout:
     * [0:20] Paymaster address
     * [20:36] Verification gas limit (uint128)
     * [36:52] Post-op gas limit (uint128)
     * [52:58] validUntil (6 bytes)
     * [58:64] validAfter (6 bytes)
     * [64:129] Signature (65 bytes)
     */
    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 /* userOpHash */,
        uint256 requiredPreFund
    ) internal override returns (bytes memory context, uint256 validationData) {
        require(userOp.paymasterAndData.length >= 129, "PM: invalid data length");

        uint48 validUntil = uint48(bytes6(userOp.paymasterAndData[52:58]));
        uint48 validAfter = uint48(bytes6(userOp.paymasterAndData[58:64]));
        bytes calldata signature = userOp.paymasterAndData[64:129];

        bytes32 hash = getHash(userOp, validUntil, validAfter).toEthSignedMessageHash();
        if (verifyingSigner != hash.recover(signature)) {
            return ("", SIG_VALIDATION_FAILED);
        }

        // 4. Pre-charge the user
        // We calculate the maximum possible token cost
        uint256 maxTokenCost = (requiredPreFund * exchangeRate) / PRICE_DENOMINATOR;
        
        // IMPORTANT: We pull tokens NOW. If we wait for postOp, the user might 
        // spend them during the call, leaving the paymaster with a loss.
        token.safeTransferFrom(userOp.sender, address(this), maxTokenCost);

        // Context passes data to _postOp
        context = abi.encode(userOp.sender, maxTokenCost, exchangeRate);
        
        return (context, _packValidationData(false, validUntil, validAfter));
    }

    function _postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) internal  {
        (address sender, uint256 maxTokenCost, uint256 rate) = abi.decode(context, (address, uint256, uint256));

        // actualGasCost already includes the overhead of the EntryPoint call
        uint256 actualTokenCost = (actualGasCost * rate) / PRICE_DENOMINATOR;

        if (maxTokenCost > actualTokenCost) {
            // Refund the excess tokens pulled during validation
            uint256 refundAmount = maxTokenCost - actualTokenCost;
            token.safeTransfer(sender, refundAmount);
        } else if (mode == PostOpMode.postOpReverted) {
            // If the postOp reverted, the EntryPoint might have consumed more gas than expected.
            // In a production environment, you'd handle this or log it.
        }

        emit GasSponsored(sender, actualGasCost, actualTokenCost);
    }

    // --- Admin & Setup ---

    function setExchangeRate(uint256 _newRate) external onlyOwner {
        exchangeRate = _newRate;
    }


    function withdrawToken(address to, uint256 amount) external onlyOwner {
        token.safeTransfer(to, amount);
    }
}