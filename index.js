const express = require('express');
const app = express();

app.use(express.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// Webhook Verification (GET)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Message Receiver (POST)
app.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    body.entry.forEach(entry => {
      if (entry.messaging) {
        entry.messaging.forEach(webhook_event => {
          const sender_psid = webhook_event.sender.id;
          if (webhook_event.message && webhook_event.message.text) {
            handleMessage(sender_psid, webhook_event.message.text);
          }
        });
      }
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Keyword Logic Setup
function handleMessage(sender_psid, received_message) {
  let response;
  const text = received_message.toLowerCase().trim();

  if (text.includes('সুন্দরবন')) {
    response = {
      "text": "আমাদের প্রাকৃতিক স্বাদের 'সুন্দরবনের খাঁটি মধু' ১০০% প্রাকৃতিক ও চাক কাটা।\n\nদাম: ১ কেজি ৮৫০ টাকা।\nঅর্ডার করতে আপনার নাম, ঠিকানা ও মোবাইল নম্বর লিখে জানান!"
    };
  } else if (text.includes('সরিষা')) {
    response = {
      "text": "আমাদের 'সরিষা ফুলের মধু' ১০০% খাঁটি ও সুস্বাদু।\n\nদাম: ১ কেজি ৬৫০ টাকা।\nঅর্ডার করতে আপনার নাম, ঠিকানা ও মোবাইল নম্বর লিখে জানান!"
    };
  } else if (text.includes('মধু') || text.includes('honey')) {
    response = {
      "text": "আমাদের কাছে পাচ্ছেন শতভাগ খাঁটি মধু:\n১. সুন্দরবনের মধু - ৮৫০ টাকা (১ কেজি)\n২. সরিষা ফুলের মধু - ৬৫ো টাকা (১ কেজি)\n\nআপনি কোনটা নিতে চান?"
    };
  } else if (text.includes('ঘি') || text.includes('ghee')) {
    response = {
      "text": "আমাদের 'প্রাকৃতিক স্বাদ' গাওয়া ঘি নাটোরের খাঁটি দুধের মাখন দিয়ে তৈরি। এটি সম্পূর্ণ সুবাসিত ও ভেজালমুক্ত।\n\nদাম: ১ কেজি ১৪০০ টাকা, ৫০০ গ্রাম ৭৫০ টাকা।"
    };
  } else if (text.includes('গুড়') || text.includes('gur') || text.includes('খেজুরে')) {
    response = {
      "text": "আমাদের কাছে পাবেন নাটোরের খাঁটি খেজুরের পাটালি ও ঝোলা গুড়। কোনো চিনি বা কেমিক্যাল মুক্ত।"
    };
  } else if (text.includes('আম') || text.includes('mango')) {
    response = {
      "text": "আমাদের নাটোরের নিজস্ব বাগান থেকে সরাসরি কেমিক্যালমুক্ত তাজা আম সরবরাহ করা হয়।"
    };
  } else if (text.includes('হাই') || text.includes('hello') || text.includes('hi') || text.includes('আসসালামু')) {
    response = {
      "text": "আসসালামু আলাইকুম! 'প্রাকৃতিক স্বাদ' পেজে আপনাকে স্বাগতম।\n\nআমাদের কাছে পাবেন খাঁটি মধু, গাওয়া ঘি, খেজুরের গুড় ও তাজা আম। আপনি কোনটি সম্পর্কে জানতে চান?"
    };
  } else if (text.includes('অর্ডার') || text.includes('order') || text.includes('দাম') || text.includes('কিনব')) {
    response = {
      "text": "অর্ডার করতে অনুগ্রহ করে আপনার নাম, পূর্ণাঙ্গ ঠিকানা এবং মোবাইল নম্বর লিখে মেসেজ দিন।"
    };
  } else {
    response = {
      "text": "ধন্যবাদ আপনার মেসেজের জন্য! আমাদের প্রতিনিধি খুব দ্রুত আপনার সাথে যোগাযোগ করবেন।"
    };
  }

  callSendAPI(sender_psid, response);
}

// Send Response via Facebook Graph API
async function callSendAPI(sender_psid, response) {
  const request_body = {
    "recipient": { "id": sender_psid },
    "message": response
  };

  try {
    await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request_body)
    });
    console.log('Message sent!');
  } catch (err) {
    console.error('Unable to send message:', err);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
