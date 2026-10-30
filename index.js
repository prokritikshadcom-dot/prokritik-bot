const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'prokritik123';

const DELIVERY_CHARGE = 120; // ডেলিভারি চার্জ ৳১২০

// কাস্টমারের পছন্দকৃত পণ্য মনে রাখার সেশন
const userSessions = {};

// বাংলা ফন্ট ও ইউনিকোড সঠিকভাবে মেলানোর ফাংশন
function normalizeBengaliText(text) {
  if (!text) return "";
  return text
    .normalize('NFC')
    .replace(/ে\u09BE|\u09BEে|ো/g, 'ো') // 'ে' + 'া' মিলিয়ে 'ো' কারে রূপান্তর
    .toLowerCase()
    .trim();
}

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
        const cleanUserText = normalizeBengaliText(messageText);
        let replyMessage = "";

        const phoneRegex = /(01[3-9]\d{8})/;
        const isOrderKeyword = cleanUserText.includes("অর্ডার") || cleanUserText.includes("কিনব") || cleanUserText.includes("নিতে চাই") || cleanUserText.includes("order");
        
        // সাধারণ সালাম বা হাই
        const isGreeting = cleanUserText === "হাই" || cleanUserText === "হ্যালো" || cleanUserText === "hi" || cleanUserText === "hello" || cleanUserText.includes("আসসালামু") || cleanUserText === "hey";

        // চার্ট বা সকল পণ্যের মূল্য তালিকা সংক্রান্ত প্রশ্ন
        const isChartAsk = cleanUserText.includes("চার্ট") || cleanUserText.includes("মূল্য তালিকা") || cleanUserText.includes("মূল্যতালিকা") || cleanUserText.includes("প্রাইস লিস্ট") || cleanUserText.includes("প্রাইস তালিকা") || cleanUserText.includes("সকল পণ্য") || cleanUserText.includes("সব পণ্য") || cleanUserText.includes("লিস্ট") || cleanUserText.includes("chart") || cleanUserText.includes("price list");

        // সাধারণ দাম জানার প্রশ্ন
        const isPriceAsk = cleanUserText.includes("দাম") || cleanUserText.includes("কত") || cleanUserText === "মధు" || cleanUserText === "modhu" || cleanUserText === "honey";

        // কম্বো বা অফার সংক্রান্ত প্রশ্ন
        const isComboAsk = cleanUserText.includes("কম্বো") || cleanUserText.includes("প্যাক") || cleanUserText.includes("অফার") || cleanUserText.includes("combo") || cleanUserText.includes("offer") || cleanUserText.includes("pack");

        // কাস্টমার যদি মোবাইল নম্বর ও ঠিকানা দিয়ে মেসেজ পাঠায় (অর্ডার কনফার্মেশন)
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
                           `💰 আনুমানিক বিল (ক্যাশ অন ডেলিভারি): ৳${totalPrice} (সাইজ/প্যাক অনুযায়ী পরিবর্তনযোগ্য)\n\n` +
                           `📝 আপনার দেওয়া তথ্য:\n${messageText}\n\n` +
                           `আমাদের প্রতিনিধি খুব দ্রুত কল করে আপনার কাঙ্ক্ষিত সাইজ, পরিমাণ ও চূড়ান্ত বিল নিশ্চিত করবেন। ধন্যবাদ 'প্রাকৃতিক স্বাদ'-এর সাথে থাকার জন্য! 🌿\n\n` +
                           `📞 প্রয়োজনে সরাসরি যোগাযোগ/হোয়াটসঅ্যাপ: 01335556732`;
            
            delete userSessions[senderPsid];
          } else {
            replyMessage = `🎉 আপনার নাম, ঠিকানা ও মোবাইল নম্বর আমরা পেয়েছি!\n\n` +
                           `আমাদের প্রতিনিধি খুব দ্রুত আপনার সাথে কল/মেসেজে যোগাযোগ করে পণ্যের নাম, সাইজ ও সর্বমোট বিল নিশ্চিত করবেন।\n\n` +
                           `📞 সরাসরি হেল্পলাইন/হোয়াটসঅ্যাপ: 01335556732`;
          }

        } else if (isGreeting) {
          replyMessage = `আসসালামু আলাইকুম! 'প্রাকৃতিক স্বাদ'-এ আপনাকে স্বাগতম। 🌿\n\n` +
                         `আমাদের ১০০% খাঁটি প্রাকৃতিক পণ্যগুলোর দাম জানতে মেসেজ দিন:\n` +
                         `• 'মূল্য তালিকা' বা 'চার্ট' (সব পণ্যের তালিকা দেখতে)\n` +
                         `• 'সরিষা ফুল', 'কালোজিরা', 'বড়ই ফুল' বা 'সুন্দরবন'\n` +
                         `• 'কম্বো প্যাক' (বিশেষ অফারগুলো দেখতে)\n\n` +
                         `স্যার, আপনি কোন পণ্যটি নিতে চাচ্ছেন?\n` +
                         `🌐 ওয়েবসাইট: https://prokritikshad.com`;

        } else if (isChartAsk) {
          // ওয়েবসাইট থেকে সকল পণ্যের মূল্য তালিকা বানিয়ে দেওয়া
          const products = await fetchProductsFromWebsite();

          if (products && Array.isArray(products) && products.length > 0) {
            replyMessage = `📋 'প্রাকৃতিক স্বাদ'-এর সকল পণ্যের মূল্য তালিকা:\n\n`;
            products.forEach((p, index) => {
              replyMessage += `${index + 1}. ${p.name} - ৳${p.price}\n`;
            });

            replyMessage += `\n🚚 ডেলিভারি চার্জ: ৳${DELIVERY_CHARGE}\n\n` +
                           `📦 যেকোনো পণ্য অর্ডার করতে আপনার নাম, মোবাইল নম্বর ও ঠিকানা লিখে পাঠাই দিন।\n` +
                           `🌐 অথবা ওয়েবসাইটে সরাসরি অর্ডার করুন: https://prokritikshad.com`;
          } else {
            replyMessage = `আসসালামু আলাইকুম! আমাদের সকল পণ্যের তালিকা দেখতে ব্রাউজ করুন: https://prokritikshad.com`;
          }

        } else if (isOrderKeyword) {
          const session = userSessions[senderPsid];
          let selectedText = "";
          if (session && session.matchedProducts && session.matchedProducts.length > 0) {
            selectedText = `\n(আপনার নির্বাচনকৃত পণ্য: ${session.matchedProducts[0].name})`;
          }

          replyMessage = `মেসেঞ্জারে সরাসরি অর্ডার নিশ্চিত করতে নিচের তথ্যগুলো এক মেসেজে লিখে পাঠান ${selectedText}:\n\n` +
                         `১. পণ্যের নাম ও সাইজ (যেমন: ১ কেজি / কম্বো প্যাক):\n` +
                         `২. আপনার নাম:\n` +
                         `৩. মোবাইল নম্বর:\n` +
                         `৪. পূর্ণাঙ্গ ঠিকানা:\n\n` +
                         `🚚 ক্যাশ অন ডেলিভারি চার্জ: ৳${DELIVERY_CHARGE}\n` +
                         `🌐 অথবা ওয়েবসাইটে সরাসরি অর্ডার করুন: https://prokritikshad.com`;

        } else {
          // ওয়েবসাইট থেকে নির্দিষ্ট পণ্য ফিল্টার করা
          const products = await fetchProductsFromWebsite();

          if (products && Array.isArray(products) && products.length > 0) {
            
            // কম্বো বা অফার সেকশন
            if (isComboAsk) {
              const comboProducts = products.filter(p => {
                if (!p.name) return false;
                const cleanName = normalizeBengaliText(p.name);
                return cleanName.includes("কম্বো") || cleanName.includes("প্যাক") || cleanName.includes("ফ্রি") || cleanName.includes("+") || cleanName.includes("অফার") || cleanName.includes("combo") || cleanName.includes("pack");
              });

              if (comboProducts.length > 0) {
                userSessions[senderPsid] = { matchedProducts: comboProducts };

                replyMessage = `আমাদের স্পেশাল কম্বো প্যাক ও অফারসমূহ:\n\n`;
                comboProducts.forEach(p => {
                  replyMessage += `• ${p.name} - ৳${p.price}\n\n`;
                });

                replyMessage += `🚚 ডেলিভারি চার্জ: ৳${DELIVERY_CHARGE}\n\n` +
                                `📦 যেকোনো কম্বো প্যাক অর্ডার করতে আপনার নাম, মোবাইল নম্বর ও ঠিকানা লিখে মেসেজ দিন।\n` +
                                `🌐 ওয়েবসাইট থেকে অর্ডার করতে: https://prokritikshad.com`;
              } else {
                replyMessage = `আমাদের সাধারণ পণ্যসমূহ দেখতে 'মধু', 'গাওয়া ঘি' বা 'মূল্য তালিকা' লিখে মেসেজ দিন।\n\n🌐 পুরো ওয়েবসাইট ব্রাউজ করুন: https://prokritikshad.com`;
              }

            } else if (isPriceAsk && !cleanUserText.includes("সরিষা") && !cleanUserText.includes("কালোজিরা") && !cleanUserText.includes("সুন্দরবন") && !cleanUserText.includes("খলিশা") && !cleanUserText.includes("বড়ই") && !cleanUserText.includes("ঘি") && !cleanUserText.includes("গুড়")) {
              
              replyMessage = `স্যার, আপনি কোন মধুটি নিতে চাচ্ছেন? আমাদের কাছে পাওয়া যাচ্ছে:\n\n` +
                             `• সরিষা ফুলের মধু\n` +
                             `• কালোজিরা ফুলের মধু\n` +
                             `• সুন্দরবনের মধু\n` +
                             `• খলিশা ফুলের মধু\n` +
                             `• বড়ই ফুলের মধু\n` +
                             `• স্পেশাল কম্বো প্যাক (অফার)\n\n` +
                             `আপনার পছন্দের নাম লিখে জানান অথবা সব পণ্যের দাম দেখতে 'মূল্য তালিকা' লিখে মেসেজ দিন।`;

            } else {
              // নির্দিষ্ট পণ্যের নাম বা কি-ওয়ার্ড সার্চ
              const stopWords = ["ফুলের", "মধু", "এর", "দাম", "কত", "চাই", "নেব", "অর্ডার", "কেজি", "গ্রাম", "১কেজি", "১", "কেজী", "পণ্য"];
              const searchWords = cleanUserText.split(/\s+/).filter(w => w.length > 1 && !stopWords.includes(w));

              const matchedProducts = products.filter(p => {
                if (!p.name) return false;
                const cleanProductName = normalizeBengaliText(p.name);

                if (cleanProductName.includes(cleanUserText) || cleanUserText.includes(cleanProductName)) {
                  return true;
                }

                if (searchWords.length > 0) {
                  return searchWords.some(word => cleanProductName.includes(word));
                }

                return false;
              });

              if (matchedProducts.length > 0) {
                userSessions[senderPsid] = { matchedProducts: matchedProducts };

                replyMessage = `আমাদের উপলব্ধ সবকটি সাইজ ও মূল্য তালিকা:\n\n`;
                matchedProducts.forEach(p => {
                  replyMessage += `• ${p.name} - ৳${p.price}\n\n`;
                });

                replyMessage += `🚚 ডেলিভারি চার্জ: ৳${DELIVERY_CHARGE}\n\n` +
                                `📦 অর্ডার করতে আপনার নাম, মোবাইল নম্বর, পূর্ণাঙ্গ ঠিকানা এবং কাঙ্ক্ষিত পণ্যটি লিখে মেসেজ দিন।\n` +
                                `🌐 অথবা ওয়েবসাইটে সরাসরি অর্ডার করুন: https://prokritikshad.com`;
              } else {
                replyMessage = `স্যার, আপনি কোন পণ্যটি নিতে চাচ্ছেন? 'মূল্য তালিকা' লিখে আমাদের সব পণ্যের দাম একসাথে দেখতে পারেন।\n\n` +
                               `🌐 আমাদের পুরো ওয়েবসাইট ব্রাউজ করুন: https://prokritikshad.com`;
              }
            }
          } else {
            replyMessage = `স্যার, আপনি কোন পণ্যটি নিতে চাচ্ছেন? 'মূল্য তালিকা' লিখে আমাদের সব পণ্যের দাম একসাথে দেখতে পারেন।\n\n` +
                           `🌐 আমাদের পুরো ওয়েবসাইট ব্রাউজ করুন: https://prokritikshad.com`;
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
