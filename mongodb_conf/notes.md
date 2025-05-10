That connection string looks good for a local development environment with a replica set running on a single machine with different ports. This is a common setup for testing replica set functionality on a development machine.
For this setup to work, you'll need to:

Start three MongoDB instances on your local machine using ports 27017, 27018, and 27019
Configure them as members of the same replica set named "rs0"

Here's a step-by-step guide to set up this local replica set:
Setting Up a Local MongoDB Replica Set (For Development)
Step 1: Create Data Directories
bashmkdir -p ~/data/rs0-0 ~/data/rs0-1 ~/data/rs0-2
Step 2: Start MongoDB Instances
Open three separate terminal windows and run one command in each:
Terminal 1:
bash mongod --replSet rs0 --port 27017 --dbpath ~/data/rs0-0 --bind_ip localhost
Terminal 2:
bashmongod --replSet rs0 --port 27018 --dbpath ~/data/rs0-1 --bind_ip localhost
Terminal 3:
bashmongod --replSet rs0 --port 27019 --dbpath ~/data/rs0-2 --bind_ip localhost
Step 3: Initialize the Replica Set
Open a new terminal and connect to MongoDB:
bashmongosh --port 27017
Then, initialize the replica set:
javascriptrs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "localhost:27017" },
    { _id: 1, host: "localhost:27018" },
    { _id: 2, host: "localhost:27019" }
  ]
})
Step 4: Check Replica Set Status
javascriptrs.status()
This will show the status of your replica set. After a few seconds, one node should be elected as PRIMARY and the others as SECONDARY.
Step 5: Update Your .env File
Update your .env file with the connection string:
MONGODB_URI=mongodb://127.0.0.1:27017,127.0.0.1:27018,127.0.0.1:27019/saas_platform?replicaSet=rs0
Once this is set up, you can use the original transaction-based code, and it should work correctly with your local replica set. This setup is great for development and testing as it allows you to test transaction functionality locally.
For a production environment, you'd follow a similar process but with separate servers instead of different ports on the same machine.