import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';

// ---- Config (можно вынести в ENV)
const TOKEN    = process.env.TOKEN    || '0xfffB251755865a815C7817e5ab9ABbe1FEf71435';
const CHAIN_ID = Number(process.env.CHAIN_ID || 137);
const AMOUNT   = BigInt(process.env.AMOUNT || 6666); // без decimals
const RPC_URL  = process.env.RPC_URL  || 'https://polygon-rpc.com';

// ---- App
const app = express();
app.use(cors());            // при желании: cors({ origin: ['https://turbofrog100.github.io', 'https://your-domain'] })
app.use(express.json());

// ---- Ethers
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet   = new ethers.Wallet(process.env.PRIVATE_KEY, provider); // приватник кошелька-источника (0x8e1e…)
const erc20    = new ethers.Contract(
  TOKEN,
  ['function symbol() view returns (string)',
   'function decimals() view returns (uint8)',
   'function transfer(address,uint256) returns (bool)'],
  wallet
);
const decimals = await erc20.decimals();
const amountWei = ethers.parseUnits(String(AMOUNT), decimals);

// простейшее анти-повторное использование (лучше БД)
const usedNonces = new Set();

app.post('/api/claim', async (req, res) => {
  try {
    const { token, claimer, amount, nonce, deadline, signature } = req.body || {};

    if ((token||'').toLowerCase() !== TOKEN.toLowerCase())
      return res.status(400).json({ error: 'Bad token' });

    if (!ethers.isAddress(claimer))
      return res.status(400).json({ error: 'Bad claimer' });

    if (String(amount) !== amountWei.toString())
      return res.status(400).json({ error: 'Bad amount' });

    const now = Math.floor(Date.now()/1000);
    if (now > Number(deadline))
      return res.status(400).json({ error: 'Expired' });

    if (usedNonces.has(String(nonce)))
      return res.status(400).json({ error: 'Nonce used' });

    const domain = { name: 'VEN Airdrop', version: '1', chainId: CHAIN_ID };
    const types  = {
      Claim: [
        { name:'claimer', type:'address' },
        { name:'amount',  type:'uint256' },
        { name:'nonce',   type:'uint256' },
        { name:'deadline',type:'uint256' }
      ]
    };
    const msg = { claimer, amount, nonce, deadline };

    const recovered = ethers.verifyTypedData(domain, types, msg, signature);
    if (recovered.toLowerCase() !== claimer.toLowerCase())
      return res.status(400).json({ error: 'Bad signature' });

    // отправляем токены пользователю
    const tx = await erc20.transfer(claimer, amountWei);
    usedNonces.add(String(nonce));

    return res.json({ ok:true, txHash: tx.hash });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log('Airdrop server on :' + PORT));
app.get("/health", (req,res)=>res.json({ok:true}));
