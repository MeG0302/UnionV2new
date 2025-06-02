# 🤖 UnionV2 Auto Transaction Bot by MeG

This is an automated transaction bot for the **Union Testnet V2**, designed by **MeG**. It performs tasks such as claiming tokens, swapping, bridging, adding/removing liquidity, and checking performance stats using a terminal dashboard.

---
## 🐦 Socials 
 Follow on twitter - https://x.com/Jaishiva0302

---
## 🚀 Features

- 🌉 Bridge USDC from Sepolia to Holesky
- 📊 Live terminal dashboard with logs and stats

---

## 📦 Installation
### 0. Update system 

```
apt update && apt install git -y && apt install sudo -y && sudo apt install git -y

```
#### Open tmux and screen session 

```
apt install tmux -y && tmux &&
```
```
screen -S unionbymeg

```

### 1. Clone the repository

```bash
git clone https://github.com/MeG0302/UnionV2new.git
cd UnionV2new
```
### 2. Add wallets 
```bash
nano wallet.json

```
>> It should be in this format
```
{
  "wallets": [
    
      "privatekey": "0xyour key",
      "babylonAddress": "babylon Address",
      "swapDirection": "Holesky to Sepolia"
    }
  ]
}
```

### 3. Add your sepolia RPC No need to do this (## ONLY DO THIS IF YOU WANT TO RUN USING YOUR OWN RPC )

```
nano main.js

```
Then search for this option in brackets JsonRPCprovider (i have recently added the public sepolia RPC so you dont need to change anything)

>>
![Screenshot 2025-06-02 202748](https://github.com/user-attachments/assets/5e7f52ee-5854-4645-bdb1-b7d4e9769b52)

then paste your RPC from https://dashboard.alchemy.com/apps

Then to run the node  put below commands to run

```
install npm -y
```
```

npm install
```
```
node main.js
```

It will open like this 

![Screenshot 2025-05-09 225423](https://github.com/user-attachments/assets/cebc6166-3549-463e-84a4-2b2f9195e6e7)

1) Write "2" to select HOLESKY (currently functional)
2) then write "usdc"
3) Write number of transactions you would like to perform

to close the bless screen simply click "q" button in key board 

and to run the bot again go to directory and paste this command again 

```bash

node main.js

```
