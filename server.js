import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';

const TOKEN = '0xfffB251755865a815C7817e5ab9ABbe1FEf71435'; // VEN
const CHAIN_ID = 137;
const AMOUNT = 6666n; // без decimals

const app = express();
app.use(cors());
app.use(express.json());

const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider); // приватник 0x8e1e...
const erc20 = new ethers.Contract(
  TOKEN,
  ['function decimals() view returns (uint8)', 'function transfer(address,uint256) returns (bool)'],
  wallet
);
const decimals = await erc20.decimals();
const amountWei = ethers.parseUnits(String(AMOUNT), decimals);

const usedNonces = new Set();

app.post('/api/claim', async (req, res) => {
  try {
    const { token, claimer, amount, nonce, deadline, signature } = req.body;
    if ((token||'').toLowerCase() !== TOKEN.toLowerCase()) return res.status(400).json({error:'Bad token'});

    if (usedNonces.has(String(nonce))) return res.status(400).json({error:'Nonce used'});
    const now = Math.floor(Date.now()/1000);
    if (now > Number(deadline)) return res.status(400).json({error:'Expired'});

    const domain = { name:'VEN Airdrop', version:'1', chainId: CHAIN_ID };
    const types  = { Claim:[
      {name:'claimer',type:'address'},
      {name:'amount',type:'uint256'},
      {name:'nonce',type:'uint256'},
      {name:'deadline',type:'uint256'}
    ]};
    const msg = { claimer, amount, nonce, deadline };

    const recovered = ethers.verifyTypedData(domain, types, msg, signature);
    if (recovered.toLowerCase() !== String(claimer).toLowerCase()) return res.status(400).json({error:'Bad sig'});
    if (amount !== amountWei.toString()) return res.status(400).json({error:'Bad amount'});

    const tx = await erc20.transfer(claimer, amountWei);
    usedNonces.add(String(nonce));
    res.json({ ok:true, txHash: tx.hash });
  } catch(e){ console.error(e); res.status(500).json({error:'Server error'}); }
});

curl -X POST https://<твой-сабдомен>.onrender.com/api/claim \
  -H "Content-Type: application/json" \
  -d '{"token":"0xfffB251755865a815C7817e5ab9ABbe1FEf71435","claimer":"0x0000000000000000000000000000000000000000","amount":"1","nonce":1,"deadline":9999999999,"signature":"0x"}'

