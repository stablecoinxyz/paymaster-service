// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0;

import {Test} from "forge-std/Test.sol";
// import {Utilities} from "./utils/Utilities.sol";
// import {Vm} from "forge-std/Vm.sol";


import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {SimpleAccount} from "@account-abstraction/contracts/samples/SimpleAccount.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {TargetExecuteContract} from "./mock/TargetExecuteContract.sol";
import {SignatureVerifyingPaymasterV07} from "../contracts/SignatureVerifyingPaymasterV07.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "forge-std/console.sol";
import {MockAccountFactory} from "./mock/mockAccountFactory.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";    
import {GasConsumingContract} from "./mock/GasConsumingContract.sol";


error SetupIncomplete();

using ECDSA for bytes32;

contract SignatureVerifyingPaymaster is Test {
    //using stdStorage for StdStorage;
    using ECDSA for bytes;
    using MessageHashUtils for bytes32;

    address owner;
    VmSafe.Wallet signer;

    VmSafe.Wallet accountOwner;

    address[] users;
    
    address internal factoryOwner;
    address payable beneficiary;
    address internal unauthorized;

    uint256 internal keyUser;
    uint256 internal keyVerifyingSigner;

    MockAccountFactory accountFactory;
    TargetExecuteContract target;
    
    uint48 validUntil;
    uint48 validAfter;

    EntryPoint entryPoint;
    SignatureVerifyingPaymasterV07 paymaster;

    uint128 callGasLimit;

    //SmartAccountFactory smartAccountFactory;
    SimpleAccount account;

    function setUp() public {

        // fork base mainnet at a recent block
        vm.selectFork(vm.createFork(vm.envString("BASE_RPC_URL"), vm.envUint("BASE_BLOCK_NUMBER")));

        //fund some users
        for(uint i = 0; i < 5; i++) {
            address user = makeAddr(string(abi.encodePacked("User", i)));
            vm.deal(user, 100 ether);
            users.push(user);  
        }

        accountOwner = vm.createWallet("AccountOwner");
        //entryPoint = EntryPoint(payable(address(0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789)));
        entryPoint = EntryPoint(payable(address(0x0000000071727De22E5E9d8BAf0edAc6f37da032)));

        // deploy account factory
        accountFactory = new MockAccountFactory(entryPoint);

        // deploy account
        vm.prank(address(entryPoint));
        account = accountFactory.createAccount(accountOwner.addr, 0);

        beneficiary = payable(makeAddr("beneficiary"));
        owner = payable(makeAddr("owner"));
        signer = vm.createWallet("signer");
       
        //deploy paymaster
        address implementation  = address(new SignatureVerifyingPaymasterV07(entryPoint));

        paymaster = SignatureVerifyingPaymasterV07(payable(Clones.clone(implementation)));

        paymaster.initialize(signer.addr, owner);

        //deploy target contract
        target = new TargetExecuteContract();   

        //fund the paymaster
        vm.prank(users[0]);
        entryPoint.depositTo{value: 1 ether}(address(paymaster));

        validUntil = uint48(block.timestamp + 1000);
        
        validAfter = uint48(block.timestamp - 1000);

        callGasLimit = 10000000;

    }

    function test_paymaster_with_target_contract() public {

        vm.prank(address(account));
        assertEq(target.userCalls(address(account)), 0);

        bytes memory functionData = abi.encodeWithSelector(
            TargetExecuteContract.increment.selector
        );
        bytes memory executeCallData = abi.encodeWithSelector(
            SimpleAccount.execute.selector,
            address(target),
            0,
            functionData
        );

        PackedUserOperation memory userOp = generateSignedUserOperation(
            executeCallData,
            address(account),
            signer,
            accountOwner
        );

        vm.prank(address(account));
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = userOp;
        entryPoint.handleOps(ops, payable(address(account)));

        vm.prank(address(account));
        assertEq(target.userCalls(address(account)), 1);

    }

    function test_with_invalid_account_signature() public {

        vm.prank(address(account));
        assertEq(target.userCalls(address(account)), 0);

        bytes memory functionData = abi.encodeWithSelector(
            TargetExecuteContract.increment.selector
        );
        bytes memory executeCallData = abi.encodeWithSelector(
            SimpleAccount.execute.selector,
            address(target),
            0,
            functionData
        );

        PackedUserOperation memory userOp = generateSignedUserOperation(
            executeCallData,
            address(account),
            signer,
            vm.createWallet("invalid_signer")
        );

        vm.prank(address(account));
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = userOp;

        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA24 signature error"));
        entryPoint.handleOps(ops, payable(address(account)));

        vm.prank(address(account));
        assertEq(target.userCalls(address(account)), 0);

    }

    function test_with_invalid_paymaster_signature() public {

        vm.prank(address(account));
        assertEq(target.userCalls(address(account)), 0);

        bytes memory functionData = abi.encodeWithSelector(
            TargetExecuteContract.increment.selector
        );
        bytes memory executeCallData = abi.encodeWithSelector(
            SimpleAccount.execute.selector,
            address(target),
            0,
            functionData
        );

        PackedUserOperation memory userOp = generateSignedUserOperation(
            executeCallData,
            address(account),
            vm.createWallet("invalid_signer"),
            accountOwner
        );

        vm.prank(address(account));
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = userOp;

        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA34 signature error"));
        entryPoint.handleOps(ops, payable(address(account)));

        vm.prank(address(account));
        assertEq(target.userCalls(address(account)), 0);

    }

    function test_with_expired_paymaster_signature() public {

        //set validUntil to be expired
        validUntil = uint48(block.timestamp - 1000);

        PackedUserOperation[] memory ops = generateNormalOps();

        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA32 paymaster expired or not due"));
        entryPoint.handleOps(ops, payable(address(account)));

    }

    function test_with_not_due_paymaster_signature() public {

        vm.prank(address(account));
        assertEq(target.userCalls(address(account)), 0);

        //set validAfter to be in the future
        validAfter = uint48(block.timestamp + 1000);

        PackedUserOperation[] memory ops = generateNormalOps();

        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA32 paymaster expired or not due"));
        entryPoint.handleOps(ops, payable(address(account)));

        vm.prank(address(account));
        assertEq(target.userCalls(address(account)), 0);

    }

    function test_cant_reuse_paymaster_signature() public {

        vm.prank(address(account));
        assertEq(target.userCalls(address(account)), 0);

        bytes memory functionData = abi.encodeWithSelector(
            TargetExecuteContract.increment.selector
        );
        bytes memory executeCallData = abi.encodeWithSelector(
            SimpleAccount.execute.selector,
            address(target),
            0,
            functionData
        );

        PackedUserOperation memory userOp = generateSignedUserOperation(
            executeCallData,
            address(account),
            signer,
            accountOwner
        );

        bytes memory paymasterData = userOp.paymasterAndData;

        vm.prank(address(users[0]));
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = userOp;
        entryPoint.handleOps(ops, payable(address(account)));

        uint192 key = 0;
        uint256 nonce = entryPoint.getNonce(
            address(account),
            key
        );

        PackedUserOperation
            memory unsignedUserOp = _generateUnsignedUserOperation(
                executeCallData,
                address(account),
                nonce,  
                signer
            );

        // insert old/used paymaster data including signature
        unsignedUserOp.paymasterAndData = paymasterData;
        
        //2. Get the userOpHash
        bytes32 userOpHash = entryPoint.getUserOpHash(
            unsignedUserOp
        );
        bytes32 digest = userOpHash.toEthSignedMessageHash();
       
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(accountOwner, digest);
        
        PackedUserOperation memory signedUserOp = unsignedUserOp;
        signedUserOp.signature = abi.encodePacked(r, s, v);


        vm.prank(address(users[0]));
        ops = new PackedUserOperation[](1);
        ops[0] = signedUserOp;

        // should fail because the paymaster signature is used again
        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA34 signature error"));
        entryPoint.handleOps(ops, payable(address(users[0])));

    }

    function test_rejects_high_gas_fee() public {

        GasConsumingContract gasConsumingContract = new GasConsumingContract();

        bytes memory functionData = abi.encodeWithSelector(
            GasConsumingContract.increment.selector
        );
        bytes memory executeCallData = abi.encodeWithSelector(
            SimpleAccount.execute.selector,
            address(gasConsumingContract),
            0,
            functionData
        );

        // set the gas limit to be large
        callGasLimit = 1000000000;

        PackedUserOperation memory userOp = generateSignedUserOperation(
            executeCallData,
            address(account),
            signer,
            accountOwner
        );

        vm.prank(address(users[0]));
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = userOp;

        //reverts due to gas cost too high
        vm.expectRevert();
        entryPoint.handleOps(ops, payable(address(users[0])));
        
    }

    function test_owner_can_withdrawDeposit() public {

        assertEq(entryPoint.balanceOf(address(paymaster)), 1 ether);
        vm.prank(owner);
        paymaster.withdrawTo(beneficiary, 1 ether);

        assertEq(payable(beneficiary).balance, 1 ether);
        assertEq(entryPoint.balanceOf(address(paymaster)), 0);
    }

    function test_non_owner_cant_withdrawDeposit() public {

        assertEq(entryPoint.balanceOf(address(paymaster)), 1 ether);
        vm.prank(users[0]);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, users[0]));
        paymaster.withdrawTo(beneficiary, 1 ether);
    }

    function test_fails_if_paymaster_not_deposited() public {

        vm.prank(owner);
        paymaster.withdrawTo(beneficiary, 1 ether);

        PackedUserOperation[] memory ops = generateNormalOps();

        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA31 paymaster deposit too low"));
        entryPoint.handleOps(ops, payable(address(account)));

        vm.prank(address(account));
        assertEq(target.userCalls(address(account)), 0);

    }

    function generateNormalOps() internal  returns (PackedUserOperation[] memory) {
        bytes memory functionData = abi.encodeWithSelector(
            TargetExecuteContract.increment.selector
        );
        bytes memory executeCallData = abi.encodeWithSelector(
            SimpleAccount.execute.selector,
            address(target),
            0,
            functionData
        );

        PackedUserOperation memory userOp = generateSignedUserOperation(
            executeCallData,
            address(account),
            signer,
            accountOwner
        );

        vm.prank(address(users[0]));
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = userOp;
        
        return ops;
    }

    function generateSignedUserOperation(
        bytes memory callData,
        address minimalAccount,
        VmSafe.Wallet memory PaymasterSigner,
        VmSafe.Wallet memory _accountOwner
    ) internal returns (PackedUserOperation memory) {
        uint192 key = 0;
        uint256 nonce = entryPoint.getNonce(
            address(minimalAccount),
            key
        );
        PackedUserOperation
            memory unsignedUserOp = _generateUnsignedUserOperation(
                callData,
                minimalAccount,
                nonce,  
                PaymasterSigner
            );
        //2. Get the userOpHash
        bytes32 userOpHash = entryPoint.getUserOpHash(
            unsignedUserOp
        );
        bytes32 digest = userOpHash.toEthSignedMessageHash();
       
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_accountOwner, digest);
        
        PackedUserOperation memory signedUserOp = unsignedUserOp;
        signedUserOp.signature = abi.encodePacked(r, s, v);

        return signedUserOp;
    }

    function _generateUnsignedUserOperation(
        bytes memory callData,
        address sender,
        uint256 nonce,
        VmSafe.Wallet memory PaymasterSigner
    ) internal returns (PackedUserOperation memory) {
        uint128 gasLimit = uint128(callGasLimit);
        uint128 verificationGasLimit = gasLimit;
        
        uint128 maxPriorityFeePerGas = 256;
        uint128 maxFeePerGas = maxPriorityFeePerGas;
        uint128 postOpGasLimit = 100000;

        // matching the way it is hashed in the paymaster
        bytes32 hash = keccak256(abi.encode(
            validUntil,
            validAfter,
            block.chainid,
            address(paymaster),
            sender
        ));

        // Convert to EIP-191 format
        bytes32 ethSignedHash = hash.toEthSignedMessageHash();

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(PaymasterSigner, ethSignedHash);

        bytes memory signature = abi.encodePacked(r, s, v);

        bytes memory paymasterAndData = abi.encodePacked(
            address(paymaster),          // 20 bytes
            uint128(verificationGasLimit), // 16 bytes
            uint128(postOpGasLimit),     // 16 bytes
            uint48(validUntil),          // 6 bytes
            uint48(validAfter),          // 6 bytes
            signature                    // 65 bytes
        );

        return
            PackedUserOperation({
                sender: sender,
                nonce: nonce,
                initCode: hex"",
                callData: callData, //callData is function data to call
                accountGasLimits: bytes32(
                    (uint256(verificationGasLimit) << 128) | gasLimit
                ),
                preVerificationGas: verificationGasLimit,
                gasFees: bytes32(
                    (uint256(maxPriorityFeePerGas) << 128) | maxFeePerGas
                ),
                paymasterAndData: paymasterAndData,
                signature: hex""
            });
    }
        
}