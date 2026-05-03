// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../../src/core/VerifyingPaymaster.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title PaymasterHarness
 * @notice Shared test harness exposing internal `_validatePaymasterUserOp`
 *         and `_postOp` so tests can drive validation/postOp paths directly
 *         without standing up a full EntryPoint.
 * @dev    Single source of truth for both VerifyingPaymaster.t.sol and
 *         VerifyingPaymasterBugs.t.sol — addresses NEW-L-02 (duplicate harness).
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
