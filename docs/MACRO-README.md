# Macro README

Below are the set up instructions for the test suite.

## 1. Run `forge compile --via-ir` in the terminal, if you dont have foundry installed on your machine install the latest version

## 2. Run `forge test -vv --via-ir` to run the tests

## 3. Currently there are 2 test suites that are similar, one uses the audited contract to run tests, the other runs the tests on a contract I created that resolves the issues presented in the report. You will see the first test fails on some of the tests, you can either resolve the issues yourself or adopt the contract provided. You can adjust the tests to work with any changes made to your contracts interface. Notably the second test follows EIP712 signature generation.

