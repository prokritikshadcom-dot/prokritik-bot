const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'prokritik123';

// ১. মেটা ওয়েবহুক ভেরিফিকেশন
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

// ২. ওয়েবসাইট থেকে ডাটা আনার ফংশন
async function fetchProductsFromWebsite() {
  try {
    const response = await fetch('https://prokritikshad.com/products_api.php');
    const products = await response.json();
    return products;
  } catch (error) {
    console.error('Website API Error:', error);
    return null;
  }
}

// ৩. মেসেঞ্জারে ব্যাক রিপ্লাই পাঠানোর ফংশন
async function sendTextMessage(senderPsid, text) {
  const requestBody = {
    recipient: { id: senderPsid },
    message: { text: text }
  };

  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    const data = await response.json();
    if (data.error) {
      console.error('Facebook Send API Error:', data.error);
    } else {
      console.log('Message sent successfully!');
    }
  } catch (err) {
    console.error('Error sending message:', err);
  }
}

// ৪. মূল মেসেজ প্রসেসিং
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    for (const entry of body.entry) {
      const webhookEvent = entry.messaging[0];
      if (!webhookEvent) continue;

      const senderPsid = webhookEvent.sender ? webhookEvent.sender.id : null;

      if (senderPsid && webhookEvent.message && webhookEvent.message.text) {
        const messageText = webhookEvent.message.text.toLowerCase();
        let replyMessage = "";

        const products = await fetchProductsFromWebsite();

        if (products && Array.isArray(products) && products.length > 0) {
          const matchedProducts = products.filter(p => 
            p.name && p.name.toLowerCase().includes(messageText)
          );

          if (matchedProducts.length > 0) {
            replyMessage = "আমাদের ওয়েবসাইটে পাওয়া যাচ্ছে:\n\n";
            matchedProducts.forEach(p => {
              replyMessage += `• ${p.name} - ৳${p.price}\n`;
            });
            replyMessage += "\nঅর্ডার করতে ভিজিট করুন: https://prokritikshad.com";
          } else {
            replyMessage = "আসসালামু আলাইকুম! প্রাকৃতিক স্বাদ পেজে আপনাকে স্বাগতম। পণ্য ও দাম জানতে 'মধু', 'ঘি' বা 'গুড়' লিখে মেসেজ দিন। বিস্তারিত: https://prokritikshad.com";
          }
        } else {
          replyMessage = "ধন্যবাদ মেসেজ দেওয়ার জন্য! আমাদের সব পণ্যের দাম ও তথ্য জানতে ব্রাউজ করুন: https://prokritikshad.com";
        }

        await sendTextMessage(senderPsid, replyMessage);
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
