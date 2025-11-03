#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================="
echo "Radius Testnet Deployment Readiness Check"
echo "========================================="
echo ""

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check 1: RPC URL
echo -n "1. Checking RADIUS_TESTNET_RPC_URL... "
if [ -z "$RADIUS_TESTNET_RPC_URL" ]; then
    echo -e "${RED}MISSING${NC}"
    echo "   Add RADIUS_TESTNET_RPC_URL to your .env file"
else
    echo -e "${GREEN}SET${NC}"
    echo "   $RADIUS_TESTNET_RPC_URL"
fi
echo ""

# Check 2: Test RPC connectivity
echo -n "2. Testing RPC connection... "
if [ ! -z "$RADIUS_TESTNET_RPC_URL" ]; then
    CHAIN_ID=$(curl -s -X POST "$RADIUS_TESTNET_RPC_URL" \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' | grep -o '"result":"[^"]*"' | cut -d'"' -f4)

    if [ ! -z "$CHAIN_ID" ]; then
        CHAIN_ID_DEC=$((16#${CHAIN_ID:2}))
        echo -e "${GREEN}SUCCESS${NC}"
        echo "   Chain ID: $CHAIN_ID_DEC (hex: $CHAIN_ID)"
        if [ "$CHAIN_ID_DEC" != "1223953" ]; then
            echo -e "   ${YELLOW}WARNING: Expected Chain ID 1223953, got $CHAIN_ID_DEC${NC}"
        fi
    else
        echo -e "${RED}FAILED${NC}"
        echo "   Could not connect to RPC"
    fi
else
    echo -e "${YELLOW}SKIPPED${NC}"
fi
echo ""

# Check 3: Deployer Private Key
echo -n "3. Checking DEPLOYER_PRIVATE_KEY... "
if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
    echo -e "${RED}MISSING${NC}"
    echo "   Add DEPLOYER_PRIVATE_KEY to your .env file"
else
    echo -e "${GREEN}SET${NC}"
    # Get deployer address using cast
    if command -v cast &> /dev/null; then
        DEPLOYER_ADDRESS=$(cast wallet address "$DEPLOYER_PRIVATE_KEY" 2>/dev/null)
        if [ ! -z "$DEPLOYER_ADDRESS" ]; then
            echo "   Address: $DEPLOYER_ADDRESS"
        fi
    fi
fi
echo ""

# Check 4: Deployer Balance
echo -n "4. Checking deployer balance... "
if [ ! -z "$RADIUS_TESTNET_RPC_URL" ] && [ ! -z "$DEPLOYER_PRIVATE_KEY" ]; then
    if command -v cast &> /dev/null; then
        DEPLOYER_ADDRESS=$(cast wallet address "$DEPLOYER_PRIVATE_KEY" 2>/dev/null)
        if [ ! -z "$DEPLOYER_ADDRESS" ]; then
            BALANCE=$(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RADIUS_TESTNET_RPC_URL" 2>/dev/null)
            if [ ! -z "$BALANCE" ]; then
                BALANCE_ETH=$(cast to-unit "$BALANCE" ether 2>/dev/null)
                echo -e "${GREEN}$BALANCE_ETH RADIUS${NC}"

                # Check if balance is too low
                BALANCE_INT=${BALANCE_ETH%.*}
                if [ "$BALANCE_INT" -lt 1 ]; then
                    echo -e "   ${YELLOW}WARNING: Balance might be too low for deployment${NC}"
                fi
            else
                echo -e "${RED}FAILED${NC}"
                echo "   Could not fetch balance"
            fi
        fi
    else
        echo -e "${YELLOW}SKIPPED${NC} (cast not installed)"
    fi
else
    echo -e "${YELLOW}SKIPPED${NC}"
fi
echo ""

# Check 5: Trusted Signer
echo -n "5. Checking TRUSTED_SIGNER... "
if [ -z "$TRUSTED_SIGNER" ]; then
    echo -e "${RED}MISSING${NC}"
    echo "   Add TRUSTED_SIGNER to your .env file"
else
    echo -e "${GREEN}SET${NC}"
    echo "   $TRUSTED_SIGNER"
fi
echo ""

# Check 6: Trusted Signer Private Key
echo -n "6. Checking TRUSTED_SIGNER_PRIVATE_KEY... "
if [ -z "$TRUSTED_SIGNER_PRIVATE_KEY" ]; then
    echo -e "${RED}MISSING${NC}"
    echo "   Add TRUSTED_SIGNER_PRIVATE_KEY to your .env file"
else
    echo -e "${GREEN}SET${NC}"
    if command -v cast &> /dev/null; then
        SIGNER_ADDRESS=$(cast wallet address "$TRUSTED_SIGNER_PRIVATE_KEY" 2>/dev/null)
        if [ ! -z "$SIGNER_ADDRESS" ]; then
            echo "   Address: $SIGNER_ADDRESS"
            if [ "$SIGNER_ADDRESS" != "$TRUSTED_SIGNER" ]; then
                echo -e "   ${RED}ERROR: Private key doesn't match TRUSTED_SIGNER address!${NC}"
            fi
        fi
    fi
fi
echo ""

# Check 7: EntryPoint Address
echo -n "7. Checking ENTRY_POINT_V07_ADDRESS... "
if [ -z "$ENTRY_POINT_V07_ADDRESS" ]; then
    echo -e "${RED}MISSING${NC}"
    echo "   Add ENTRY_POINT_V07_ADDRESS to your .env file"
else
    echo -e "${GREEN}SET${NC}"
    echo "   $ENTRY_POINT_V07_ADDRESS"
fi
echo ""

# Check 8: EntryPoint exists on chain
echo -n "8. Verifying EntryPoint on Radius Testnet... "
if [ ! -z "$RADIUS_TESTNET_RPC_URL" ] && [ ! -z "$ENTRY_POINT_V07_ADDRESS" ]; then
    if command -v cast &> /dev/null; then
        CODE=$(cast code "$ENTRY_POINT_V07_ADDRESS" --rpc-url "$RADIUS_TESTNET_RPC_URL" 2>/dev/null)
        if [ ! -z "$CODE" ] && [ "$CODE" != "0x" ]; then
            echo -e "${GREEN}DEPLOYED${NC}"
            echo "   Contract code found at address"
        else
            echo -e "${RED}NOT FOUND${NC}"
            echo "   No contract code at this address on Radius Testnet"
            echo "   You need to deploy EntryPoint v0.7 first"
        fi
    else
        echo -e "${YELLOW}SKIPPED${NC} (cast not installed)"
    fi
else
    echo -e "${YELLOW}SKIPPED${NC}"
fi
echo ""

# Check 9: Foundry installation
echo -n "9. Checking Foundry installation... "
if command -v forge &> /dev/null; then
    FORGE_VERSION=$(forge --version | head -n1)
    echo -e "${GREEN}INSTALLED${NC}"
    echo "   $FORGE_VERSION"
else
    echo -e "${YELLOW}NOT FOUND${NC}"
    echo "   Install from: https://book.getfoundry.sh/"
fi
echo ""

# Check 10: Contracts compiled
echo -n "10. Checking if contracts are compiled... "
if [ -d "artifacts/contracts/SignatureVerifyingPaymasterV07.sol" ] || [ -d "out/SignatureVerifyingPaymasterV07.sol" ]; then
    echo -e "${GREEN}YES${NC}"
else
    echo -e "${YELLOW}NO${NC}"
    echo "   Run: forge build"
fi
echo ""

# Summary
echo "========================================="
echo "Summary"
echo "========================================="
echo ""

if [ ! -z "$RADIUS_TESTNET_RPC_URL" ] && [ ! -z "$DEPLOYER_PRIVATE_KEY" ] && \
   [ ! -z "$TRUSTED_SIGNER" ] && [ ! -z "$TRUSTED_SIGNER_PRIVATE_KEY" ] && \
   [ ! -z "$ENTRY_POINT_V07_ADDRESS" ]; then
    echo -e "${GREEN}✓ All required environment variables are set${NC}"
    echo ""
    echo "You're ready to deploy! Run:"
    echo ""
    echo "  forge script script/DeployPaymaster.s.sol \\"
    echo "    --rpc-url \$RADIUS_TESTNET_RPC_URL \\"
    echo "    --broadcast \\"
    echo "    --private-key \$DEPLOYER_PRIVATE_KEY \\"
    echo "    --legacy"
else
    echo -e "${RED}✗ Some environment variables are missing${NC}"
    echo "Please fix the issues above before deploying."
fi
echo ""
