const { expect } = require("chai");

describe("Distamarkets contract", () => {
    let Distamarkets, distamarkets, owner, addr1, addr2;

    beforeEach(async () => {
        Distamarkets = await ethers.getContractFactory("Distamarkets");
        distamarkets = await Distamarkets.deploy();
        [owner, addr1, addr2, _] = await ethers.getSigners(); 
    });

    describe("Deployment", () => {
        it ("Should set the right owner", async () => {
            expect(await distamarkets.owner()).to.equal(owner.address);
        });

    });
    
    describe("Markets", () => {
        it ("Should create markets", async () => {
            // create first market
            await distamarkets.connect(addr1).createMarket("Will this first market work?", "ipfs://test/test1.png", [ethers.utils.formatBytes32String ('no'), ethers.utils.formatBytes32String('yes')]);
            
            let marketId = await distamarkets.getMarketIndex();
            expect(marketId).to.equal(1);

            // create second market
            await distamarkets.connect(addr1).createMarket("Will this second market work?", "ipfs://test/test2.png", [ethers.utils.formatBytes32String ('no'), ethers.utils.formatBytes32String('yes')]);
            
            let newMarketId = await distamarkets.getMarketIndex();
            expect(newMarketId).to.equal(2);

            // check everything was saved correctly
            [title, image, outcomes, state]  = await distamarkets.getMarket(1);

            expect(title).to.equal("Will this first market work?");
            expect(image).to.equal("ipfs://test/test1.png");
            expect(outcomes[0]).to.equal(ethers.utils.formatBytes32String ('no'));
            expect(outcomes[1]).to.equal(ethers.utils.formatBytes32String ('yes'));
        });
    });

    describe("Betting", () => {
        it ("Should allow adding stake", async () => {
            // create market
            await distamarkets.connect(addr1).createMarket("Will this first market work?", "ipfs://test/test1.png", [ethers.utils.formatBytes32String ('no'), ethers.utils.formatBytes32String('yes')]);
        
            // add stake with both users
            await distamarkets.connect(addr1).addStake(1, 0, {
                value: ethers.utils.parseEther("50")
            });
            await distamarkets.connect(addr2).addStake(1, 1, {
                value: ethers.utils.parseEther("25")
            });

            // checks stakes are counted correctly
            let addr1StakeId = await distamarkets.getStakeId(addr1.address, 1, 0);
            let addr1Stake = await distamarkets.getStake(addr1StakeId);
            expect(addr1Stake.amount).to.equal(ethers.utils.parseEther("50"));

            let addr2StakeId = await distamarkets.getStakeId(addr2.address, 1, 1);
            let addr2Stake = await distamarkets.getStake(addr2StakeId);
            expect(addr2Stake.amount).to.equal(ethers.utils.parseEther("25"));

            // ensure no wrong stake
            // addr1Stake = await distamarkets.getStake(addr1.address, 1, 1);
            // expect(addr1Stake).to.equal("0");

            // ensure stake is counted correctly
            let totalStake = await distamarkets.getMarketTotalStake(1);
            expect(totalStake).to.equal(ethers.utils.parseEther("75"));
        });

        it ("Should allow removing stake", async () => {
            // create market
            await distamarkets.connect(addr1).createMarket("Will this first market work?", "ipfs://test/test1.png", [ethers.utils.formatBytes32String ('no'), ethers.utils.formatBytes32String('yes')]);
            
            // add stake
            await distamarkets.connect(addr1).addStake(1, 0, {
                value: ethers.utils.parseEther("50")
            });
            let addr1StakeId = await distamarkets.getStakeId(addr1.address, 1, 0);

            // track user current balance
            let initialBalance = await addr1.getBalance();

            // remove part of stake
            await distamarkets.connect(addr1).removeStake(addr1StakeId, 1, ethers.utils.parseEther("10"));
            
            // ensure stake is tracked correctly
            let addr1Stake = await distamarkets.getStake(addr1StakeId);
            expect(addr1Stake.amount).to.equal(ethers.utils.parseEther("40"));
            
            // ensure user received funds
            let finalBalance = await addr1.getBalance();
            console.log(initialBalance, finalBalance, finalBalance.sub(initialBalance));

            expect(finalBalance.sub(initialBalance)).to.be.at.least(ethers.utils.parseEther("9"));

        });
    });
});