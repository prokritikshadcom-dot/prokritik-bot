const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'prokritik123';

const DELIVERY_CHARGE = 120; // ডেলিভারি চার্জ ৳১২০

// কাস্টমারের পছন্দকৃত পণ্য ও সাইজ মনে রাখার সেশন
const userSessions = {};

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

// ২. ওয়েবসাইট থেকে ডাটা আনার ফাংশন
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

// ৩. মেসেঞ্জারে উত্তর পাঠানোর ফাংশন
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
        const messageText = webhookEvent.message.text.trim();
        const lowerText = messageText.toLowerCase();
        let replyMessage = "";

        const phoneRegex = /(01[3-9]\d{8})/;
        const isOrderKeyword = lowerText.includes("অর্ডার") || lowerText.includes("কিনব") || lowerText.includes("নিতে চাই") || lowerText.includes("order");

        // কাস্টমার যদি মোবাইল নম্বর ও ঠিকানা দিয়ে মেসেজ পাঠায়
        if (phoneRegex.test(messageText)) {
          const session = userSessions[senderPsid];
          
          if (session && session.matchedProducts && session.matchedProducts.length > 0) {
            let productListText = "";
            let basePrices = [];

            session.matchedProducts.forEach(p => {
              const price = parseFloat(p.price.toString().replace(/[^0-9.]/g, '')) || 0;
              productListText += `• ${p.name} - ৳${price}\n`;
              basePrices.push(price);
            });

            const minPrice = Math.min(...basePrices);
            const totalPrice = minPrice + DELIVERY_CHARGE;

            replyMessage = `🎉 আপনার অর্ডারটি গ্রহণ করা হয়েছে!\n\n` +
                           `📦 পছন্দকৃত পণ্যের তালিকা ও সাইজ:\n${productListText}` +
                           `• ডেলিভারি চার্জ: ৳${DELIVERY_CHARGE}\n` +
                           `──────────────────\n` +
                           `💰 আনুমানিক বিল (ক্যাশ অন ডেলিভারি): ৳${totalPrice} (সাইজ অনুযায়ী পরিবর্তনযোগ্য)\n\n` +
                           `📝 আপনার দেওয়া তথ্য:\n${messageText}\n\n` +
                           `আমাদের প্রতিনিধি খুব দ্রুত কল করে আপনার কাঙ্ক্ষিত সাইজ, পরিমাণ ও চূড়ান্ত বিল নিশ্চিত করবেন। ধন্যবাদ 'প্রাকৃতিক স্বাদ'-এর সাথে থাকার জন্য! 🌿\n\n` +
                           `📞 প্রয়োজনে সরাসরি যোগাযোগ/হোয়াটসঅ্যাপ: 01335556732`;
            
            delete userSessions[senderPsid];
          } else {
            replyMessage = `🎉 আপনার নাম, ঠিকানা ও মোবাইল নম্বর আমরা পেয়েছি!\n\n` +
                           `আমাদের প্রতিনিধি খুব দ্রুত আপনার সাথে কল/মেসেজে যোগাযোগ করে পণ্যের নাম, সাইজ ও সর্বমোট বিল নিশ্চিত করবেন।\n\n` +
                           `📞 সরাসরি হেল্পলাইন/হোয়াটসঅ্যাপ: 01335556732`;
          }

        } else if (isOrderKeyword) {
          const session = userSessions[senderPsid];
          let selectedText = "";
          if (session && session.matchedProducts && session.matchedProducts.length > 0) {
            selectedText = `\n(আপনার নির্বাচনকৃত পণ্য: ${session.matchedProducts[0].name})`;
          }

          replyMessage = `মেসেঞ্জারে সরাসরি অর্ডার নিশ্চিত করতে নিচের তথ্যগুলো এক মেসেজে লিখে পাঠান ${selectedText}:\n\n` +
                         `১. পণ্যের নাম ও সাইজ (যেমন: ১ কেজি / ৫০০ গ্রাম):\n` +
                         `২. আপনার নাম:\n` +
                         `৩. মোবাইল নম্বর:\n` +
                         `৪. পূর্ণাঙ্গ ঠিকানা:\n\n` +
                         `🚚 ক্যাশ অন ডেলিভারি চার্জ: ৳${DELIVERY_CHARGE}\n` +
                         `🌐 অথবা ওয়েবসাইটে সরাসরি অর্ডার করুন: https://prokritikshad.com`;

        } else {
          // ওয়েবসাইট থেকে লাইভ ডাটা পড়া
          const products = await fetchProductsFromWebsite();

          if (products && Array.isArray(products) && products.length > 0) {

            // কাস্টমার যদি সাধারণ প্রশ্ন করে (যেমন: "আপনাদের মধুর দাম কি", "দাম কত", "মধু")
            const isGeneralHoneyAsk = lowerText.includes("দাম") || lowerText === "মধু" || lowerText === "modhu" || lowerText === "honey";

            if (isGeneralHoneyAsk && !lowerText.includes("সরিষা") && !lowerText.includes("কালোজিরা") && !lowerText.includes("সুন্দরবন") && !lowerText.includes("খলিশা") && !lowerText.includes("বড়ই") && !lowerText.includes("ঘি") && !lowerText.includes("গুড়")) {
              
              replyMessage = `স্যার, আপনি কোন মধুটি নিতে চাচ্ছেন? আমাদের কাছে পাওয়া যাচ্ছে:\n\n` +
                             `• সরিষা ফুলের মধু\n` +
                             `• কালোজিরা ফুলের মধু\n` +
                             `• সুন্দরবনের মধু\n` +
                             `• খলিশা ফুলের মধু\n` +
                             `• বড়ই ফুলের মধু\n\n` +
                             `আপনার পছন্দের মধুর নাম লিখে মেসেজ দিন (যেমন: 'সরিষা ফুল' বা 'কালোজিরা')। আমরা সব সাইজ ও দাম জানিয়ে দেবো।`;

            } else {
              // কাস্টমার নির্দিষ্ট কোনো মধুর নাম বললে (যেমন: "সরিষা", "কালোজিরা", "সুন্দরবন", "ঘি", "গুড়" ইত্যাদি)
              const matchedProducts = products.filter(p => 
                p.name && p.name.toLowerCase().includes(lowerText)
              );

              if (matchedProducts.length > 0) {
                // সেশনে ওই মধুর সবকটি সাইজ সেভ রাখা হলো
                userSessions[senderPsid] = { matchedProducts: matchedProducts };

                replyMessage = `আমাদের উপলব্ধ সবকটি সাইজ ও মূল্য তালিকা:\n\n`;
                matchedProducts.forEach(p => {
                  replyMessage += `• ${p.name} - ৳${p.price}\n`;
                });

                replyMessage += `\n🚚 ডেলিভারি চার্জ: ৳${DELIVERY_CHARGE}\n\n` +
                                `📦 অর্ডার করতে আপনার নাম, মোবাইল নম্বর, পূর্ণাঙ্গ ঠিকানা এবং কাঙ্ক্ষিত সাইজটি লিখে মেসেজ দিন।\n` +
                                `🌐 অথবা ওয়েবসাইটে সরাসরি অর্ডার করুন: https://prokritikshad.com`;
              } else {
                replyMessage = `স্যার, আপনি কোন পণ্যটি নিতে চাচ্ছেন? অনুগ্রহ করে নির্দিষ্ট পণ্যের নাম লিখে জানান (যেমন: 'সরিষা ফুল', 'কালোজিরা', 'গাওয়া ঘি')।\n\n` +
                               `🌐 আমাদের পুরো ওয়েবসাইট ব্রাউজ করুন: https://prokritikshad.com`;
              }
            }

          } else {
            replyMessage = `আসসালামু আলাইকুম! 'প্রাকৃতিক স্বাদ'-এ আপনাকে স্বাগতম। আপনার প্রয়োজনীয় পণ্যের নাম জানান অথবা ভিজিট করুন: https://prokritikshad.com`;
          }
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
