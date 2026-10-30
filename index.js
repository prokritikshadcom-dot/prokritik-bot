const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'prokritik123';

// ডেলিভারি চার্জ (প্রয়োজনে এখান থেকে পরিবর্তন করতে পারবেন)
const DELIVERY_CHARGE = 120; // ৳১২০ টাকা (ঢাকা ও ঢাকার বাইরে মানানসই চার্জ)

// কাস্টমারের পছন্দকৃত পণ্য সাময়িকভাবে মনে রাখার সেশন
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

// ৪. মূল মেসেজ প্রসেসিং ও অটোমেটিক ইনভয়েস লজিক
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

        // ফোন নম্বর শনাক্তকরণের রেগেক্স (১১ ডিজিটের বিকাশ/মোবাইল নম্বর)
        const phoneRegex = /(01[3-9]\d{8})/;
        const isOrderKeyword = lowerText.includes("অর্ডার") || lowerText.includes("কিনব") || lowerText.includes("নিতে চাই") || lowerText.includes("order");

        if (phoneRegex.test(messageText)) {
          // কাস্টমার ফোন নম্বর ও ঠিকানা পাঠালে স্বয়ংক্রিয় অর্ডার কনফার্মেশন ও হিসাব তৈরি
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
                           `📞 প্রয়োজনে যোগাযোগ বা হোয়াটসঅ্যাপ করুন: 01335556732`;
            
            // অর্ডার শেষে সেশন রিমুভ করা
            delete userSessions[senderPsid];
          } else {
            // যদি আগে নির্দিষ্ট পণ্যের নাম কাস্টমার সিলেক্ট না করে সরাসরি নম্বর পাঠায়
            replyMessage = `🎉 আপনার অর্ডারের তথ্য ও মোবাইল নম্বর আমরা পেয়েছি!\n\n` +
                           `🚚 ডেলিভারি চার্জ: ৳${DELIVERY_CHARGE}\n` +
                           `আপনার দেওয়া তথ্য:\n${messageText}\n\n` +
                           `আমাদের প্রতিনিধি খুব দ্রুত আপনার সাথে যোগাযোগ করে পণ্যের নাম ও সর্বমোট বিল নিশ্চিত করবেন।\n\n` +
                           `📞 হেল্পলাইন/হোয়াটসঅ্যাপ: 01335556732`;
          }

        } else if (isOrderKeyword) {
          replyMessage = `অর্ডার করতে অনুগ্রহ করে নিচের তথ্যগুলো এক মেসেজে লিখে পাঠান:\n\n` +
                         `১. পণ্যের নাম ও পরিমাণ:\n` +
                         `২. আপনার নাম:\n` +
                         `৩. মোবাইল নম্বর:\n` +
                         `৪. পূর্ণাঙ্গ ঠিকানা:\n\n` +
                         `🚚 ক্যাশ অন ডেলিভারি চার্জ: ৳${DELIVERY_CHARGE}\n` +
                         `🌐 অথবা ওয়েবসাইটে অর্ডার করুন: https://prokritikshad.com`;
        } else {
          // ওয়েবসাইট থেকে লাইভ প্রোডাক্ট ফিল্টার করা
          const products = await fetchProductsFromWebsite();

          if (products && Array.isArray(products) && products.length > 0) {
            const matchedProducts = products.filter(p => 
              p.name && p.name.toLowerCase().includes(lowerText)
            );

            if (matchedProducts.length > 0) {
              // কাস্টমার যে পণ্য বেছে নিয়েছে তা সেশনে সেভ রাখা
              userSessions[senderPsid] = { lastProduct: matchedProducts[0] };

              replyMessage = `আমাদের ওয়েবসাইটে পাওয়া যাচ্ছে:\n\n`;
              matchedProducts.forEach(p => {
                replyMessage += `• ${p.name} - ৳${p.price}\n`;
              });
              replyMessage += `\n🚚 ডেলিভারি চার্জ: ৳${DELIVERY_CHARGE}\n\n` +
                              `📦 মেসেঞ্জারে অর্ডার করতে 'অর্ডার' লিখুন অথবা আপনার নাম, ঠিকানা ও মোবাইল নম্বর লিখে পাঠিয়ে দিন।\n` +
                              `🌐 ওয়েবসাইট থেকে কিনতে: https://prokritikshad.com`;
            } else {
              replyMessage = `আসসালামু আলাইকুম! 'প্রাকৃতিক স্বাদ'-এ আপনাকে স্বাগতম।\n\n` +
                             `• পণ্য ও দাম জানতে 'মধু', 'ঘি' বা 'গুড়' লিখে মেসেজ দিন।\n` +
                             `• সরাসরি অর্ডার করতে 'অর্ডার' লিখুন।\n` +
                             `• ভিজিট করুন: https://prokritikshad.com`;
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
