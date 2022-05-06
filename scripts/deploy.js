async function main() {
    
    const [deployer] = await ethers.getSigners();
    console.log(`Deploying contract using address ${deployer.address}`);

    const balance = await deployer.getBalance();
    console.log(`Current balance: ${balance.toString()}`);

    const Distamarkets = await ethers.getContractFactory("Distamarkets");
    const distamarkets = await Distamarkets.deploy();
    console.log(`Distamarkets deployed at ${distamarkets.address}`);

    let blocksToWait = 5;
    console.log(`Waiting ${blocksToWait} block confirmations...`)
    await distamarkets.deployTransaction.wait(blocksToWait);

    console.log("Verifying contract on etherscan.")
    await hre.run("verify:verify", {
        address: distamarkets.address
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