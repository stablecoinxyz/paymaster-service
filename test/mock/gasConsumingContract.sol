contract GasConsumingContract {

    uint256 public counter;

    function increment() public {
        for(uint i = 0; i < 1000; i++) {
            for(uint j = 0; j < 1000; j++) {
                for(uint k = 0; k < 1000; k++) {
                    counter++;
                }
            }
        }
    }

}