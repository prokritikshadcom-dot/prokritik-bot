const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'prokritik123';

const DELIVERY_CHARGE = 120; // ডেলিভারি চার্জ ৳১২০

// কাস্টমারের পছন্দকৃত পণ্য মনে রাখার মেমোরি সেশন
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

        // কাস্টমার যদি ফোন নম্বর ও ঠিকানা পাঠায়
        if (phoneRegex.test(messageText)) {
          const session = userSessions[senderPsid];
          
          if (session && session.lastProduct) {
            const product = session.lastProduct;
            const productPrice = parseFloat(product.price.toString().replace(/[^0-9.]/g, '')) || 0;
            const totalPrice = productPrice + DELIVERY_CHARGE;

            replyMessage = `🎉 আপনার অর্ডারটি সফলভাবে গ্রহণ করা হয়েছে!\n\n` +
                           `📦 অর্ডারের বিবরণ:\n` +
                           `• পণ্য: ${product.name}\n` +
                           `• পণ্যের মূল্য: ৳${productPrice}\n` +
                           `• ডেলিভারি চার্জ: ৳${DELIVERY_CHARGE}\n` +
                           `──────────────────\n` +
                           `💰 সর্বমোট বিল (ক্যাশ অন ডেলিভারি): ৳${totalPrice}\n\n` +
                           `📝 আপনার দেওয়া তথ্য:\n${messageText}\n\n` +
                           `আমাদের প্রতিনিধি খুব দ্রুত কল করে আপনার অর্ডারটি নিশ্চিত করবেন। ধন্যবাদ 'প্রাকৃতিক স্বাদ'-এর সাথে থাকার জন্য! 🌿\n\n` +
                           `📞 প্রয়োজনে সরাসরি যোগাযোগ বা হোয়াটসঅ্যাপ করুন: 01335556732`;
            
            delete userSessions[senderPsid];
          } else {
            replyMessage = `🎉 আপনার নাম, ঠিকানা ও মোবাইল নম্বর আমরা পেয়েছি!\n\n` +
                           `অনুগ্রহ করে জানান আপনি কোন পণ্যটি (যেমন: সরিষা ফুলের মধু / কালোজিরা ফুলের মধু / গাওয়া ঘি) নিতে চাচ্ছেন?\n\n` +
                           `📞 সরাসরি হেল্পলাইন/হোয়াটসঅ্যাপ: 01335556732`;
          }

        } else if (isOrderKeyword) {
          const session = userSessions[senderPsid];
          let selectedText = session && session.lastProduct ? `\n(আপনার নির্বাচিত পণ্য: ${session.lastProduct.name})` : "";

          replyMessage = `মেসেঞ্জারে সরাসরি অর্ডার নিশ্চিত করতে নিচের তথ্যগুলো এক মেসেজে লিখে পাঠান ${selectedText}:\n\n` +
                         `১. পণ্যের নাম ও পরিমাণ:\n` +
                         `২. আপনার নাম:\n` +
                         `৩. মোবাইল নম্বর:\n` +
                         `৪. পূর্ণাঙ্গ ঠিকানা:\n\n` +
                         `🚚 ক্যাশ অন ডেলিভারি চার্জ: ৳${DELIVERY_CHARGE}\n` +
                         `🌐 অথবা ওয়েবসাইটে সরাসরি অর্ডার করুন: https://prokritikshad.com`;

        } else {
          // ওয়েবসাইট থেকে ডাটা পড়া
          const products = await fetchProductsFromWebsite();

          if (products && Array.isArray(products) && products.length > 0) {
            
            // কাস্টমার যদি শুধু সাধারণ "মধু" লেখে
            if (lowerText === "মধু" || lowerText === "modhu" || lowerText === "honey") {
              const honeyProducts = products.filter(p => p.name && p.name.toLowerCase().includes("মধু"));

              if (honeyProducts.length > 0) {
                replyMessage = `আমাদের কাছে নিচের মধুগুলো পাওয়া যাচ্ছে:\n\n`;
                honeyProducts.forEach(p => {
                  replyMessage += `• ${p.name} - ৳${p.price}\n`;
                });
                replyMessage += `\n❓ আপনি কোন মধুটি নিতে চাচ্ছেন? (যেমন: 'সরিষা ফুল' বা 'কালোজিরা ফুল' লিখে জানান)\n` +
                                `🌐 অথবা ওয়েবসাইটে দেখুন: https://prokritikshad.com`;
              } else {
                replyMessage = `দুঃখিত, এই মুহূর্তে স্টকে মধু নেই। ওয়েবসাইট ভিজিট করুন: https://prokritikshad.com`;
              }

            } else {
              // কাস্টমার যদি নির্দিষ্ট মধুর নাম বলে (যেমন: "সরিষা", "সরিষা ফুল", "কালোজিরা", "সুন্দরবন" ইত্যাদি)
              const matchedProducts = products.filter(p => 
                p.name && p.name.toLowerCase().includes(lowerText)
              );

              if (matchedProducts.length > 0) {
                const chosenProduct = matchedProducts[0];
                userSessions[senderPsid] = { lastProduct: chosenProduct };

                replyMessage = `আমাদের ${chosenProduct.name}-এর বিবরণ:\n\n` +
                               `• পণ্য: ${chosenProduct.name}\n` +
                               `• মূল্য: ৳${chosenProduct.price}\n` +
                               `• ডেলিভারি চার্জ: ৳${DELIVERY_CHARGE}\n\n` +
                               `📦 এই পণ্যটি অর্ডার করতে আপনার নাম, মোবাইল নম্বর ও ঠিকানা লিখে মেসেজ দিন।\n` +
                               `🌐 ওয়েবসাইটে অর্ডার করতে ভিজিট করুন: https://prokritikshad.com`;
              } else {
                replyMessage = `আসসালামু আলাইকুম! 'প্রাকৃতিক স্বাদ'-এ আপনাকে স্বাগতম।\n\n` +
                               `• সব মধু দেখতে 'মধু' লিখে মেসেজ দিন।\n` +
                               `• নির্দিষ্ট পণ্য যেমন 'সরিষা ফুল' বা 'ঘি' লিখে অনুসন্ধান করুন।\n` +
                               `• অথবা ভিজিট করুন: https://prokritikshad.com`;
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
