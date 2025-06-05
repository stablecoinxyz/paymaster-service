// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.23;

contract TargetExecuteContract {

    mapping(address => uint) public userCalls;

    function increment() public {
        userCalls[msg.sender] += 1;
    }

}