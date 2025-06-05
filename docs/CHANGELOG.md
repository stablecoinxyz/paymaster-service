# Changelog

## 0.4.0

- Updated `SignatureVerifyingPaymasterV07` contract to address security issues identified in the audit.
- Implemented fixes for critical, high, medium, and low severity issues.
- Updated documentation in `AUDIT-FIXES.md` to reflect the changes and test completeness.
- Moved all documentation files except the main `README.md` to the `docs/` directory.
- Updated the main `README.md` to include links to the moved documentation files.

## 0.3.2

- Cleaned up README and admin scripts
- MIT `LICENSE`

## 0.3.1

- Changed to deterministic deployment of implementation and proxy contracts
- Changed to deterministic upgrading of implementation contract
- Chain-specific admin tasks
- Chain-specific wallet clients
- Chain-specific Bundler, RPC, and Paymaster URLs
- Error tracking with Sentry

## 0.3.0

- Use Universal Upgradeable Proxy Standard (UUPS) pattern for `SignatureVerifyingPaymaster`
- Added `ADMIN-README.md` with hardhat tasks to deploy and upgrade the paymaster, fund paymaster, and withdraw funds, update trusted signer, and check paymaster status

## 0.2.0

- Use `SignatureVerifyingPaymaster` contract with ECDSA signature verification, verifying signer and owner
- Added compatible paymaster service
- Configurable `TRUSTED_SIGNER_PRIVATE_KEY`, `DEPLOYER_PRIVATE_KEY`, and `CHAIN` via environment variables
- Hardhat task to convert private key to address, verifying contract source code on Etherscan

## 0.1.0

- Initial release
- Added support for v0.7 of the Account Abstraction standard
- Use `ApproveAllPaymaster` smart contract
- Configurable `BUNDLER_URL` and `RPC_URL` via environment variables
- Hosted on Vercel Serverless
