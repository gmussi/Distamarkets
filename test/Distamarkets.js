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
            await distamarkets.connect(addr1).createMarket("Will this first market work?", [ethers.utils.formatBytes32String ('no'), ethers.utils.formatBytes32String('yes')]);
            
            let marketId = await distamarkets.getMarketIndex();
            expect(marketId).to.equal(1);

            // create second market
            await distamarkets.connect(addr1).createMarket("Will this second market work?", [ethers.utils.formatBytes32String ('no'), ethers.utils.formatBytes32String('yes')]);
            
            let newMarketId = await distamarkets.getMarketIndex();
            expect(newMarketId).to.equal(2);

            // check everything was saved correctly
            [title, outcomes, state]  = await distamarkets.getMarket(0);

            expect(title).to.equal("Will this first market work?");
            expect(outcomes[0]).to.equal(ethers.utils.formatBytes32String ('no'));
            expect(outcomes[1]).to.equal(ethers.utils.formatBytes32String ('yes'));
        });

    });
});