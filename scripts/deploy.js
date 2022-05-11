const WFAIR_ADDRESS = {
    mumbai: "0x2d8173753616aE437819D3204B21e813D7d4cC29"
};

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(`Deploying contract using wallet ${deployer.address}`);

    const balance = await deployer.getBalance();
    console.log(`Current balance: ${balance.toString()}`);

    // load previously deployed WFAIR contract
    let tokenAddress = WFAIR_ADDRESS[hardhatArguments.network];

    const Distamarkets = await ethers.getContractFactory("Distamarkets");
    const distamarkets = await Distamarkets.deploy(tokenAddress);
    console.log(`Distamarkets deployed at address ${distamarkets.address} in`);

    let blocksToWait = 5;
    console.log(`Waiting ${blocksToWait} block confirmations...`)
    for (let i = 1; i <= blocksToWait; i++) {
        await distamarkets.deployTransaction.wait(i);
        console.log(`Block ${i} mined.`)
    }

    console.log("Verifying contract on etherscan.")
    await hre.run("verify:verify", {
        address: distamarkets.address,
        constructorArguments: [tokenAddress]
    });
      

};

main()
    .then(() => {
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });