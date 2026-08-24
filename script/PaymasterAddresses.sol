// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @notice Per-chain paymaster proxy addresses, resolved from block.chainid.
/// @dev Mirrors getPaymasterProxyAddress in src/helpers/utils.ts. Scripts must use this
///      instead of vm.envAddress("PROXY_ADDRESS"): that variable holds a single address,
///      so running a script against another network would target a paymaster that does
///      not exist there.
library PaymasterAddresses {
    uint256 internal constant BASE = 8453;
    uint256 internal constant BASE_SEPOLIA = 84532;
    uint256 internal constant RADIUS = 723487;
    uint256 internal constant RADIUS_TESTNET = 72344;

    address internal constant PAYMASTER_BASE = 0x122a75a246BD8d9D2C1d5a1581529CC2e7365e92;
    address internal constant PAYMASTER_RADIUS = 0xeAe0528eCfa059D96421268dc8FaeC7DcAf5b9F0;

    /// @notice Returns the paymaster proxy for the chain the script is running against.
    function proxy() internal view returns (address) {
        if (block.chainid == BASE || block.chainid == BASE_SEPOLIA) {
            return PAYMASTER_BASE;
        }
        if (block.chainid == RADIUS || block.chainid == RADIUS_TESTNET) {
            return PAYMASTER_RADIUS;
        }
        revert(string.concat("No paymaster configured for chain id ", vm2str(block.chainid)));
    }

    function vm2str(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 digits;
        for (uint256 v = value; v != 0; v /= 10) digits++;
        bytes memory buf = new bytes(digits);
        for (uint256 v = value; v != 0; v /= 10) buf[--digits] = bytes1(uint8(48 + (v % 10)));
        return string(buf);
    }
}
