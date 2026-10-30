const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'prokritik123';

const DELIVERY_CHARGE = 120; // ডেলিভারি চার্জ ৳১২০

const userSessions = {};

// বাংলা সংখ্যাকে ইংরেজি সংখ্যায় রূপান্তর
function convertBengaliToEnglishNumbers(str) {
  if (!str) return "";
  const banglaNums = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return str.replace(/[০-৯]/g, (w) => banglaNums.indexOf(w));
}

// বাংলা টেক্সট, ইউনিকোড নুকতা ও 'ড়/র' ফিক্স ফাংশন
function normalizeBengaliText(text) {
  if (!text) return "";
  return text
    .normalize('NFC')
    .replace(/ে\u09BE|\u09BEে|ো/g, 'ো')
    .replace(/\u09A1\u09BC/g, 'ড়') // ড + ় -> ড়
    .replace(/\u09A2\u09BC/g, 'ঢ়') // ঢ + ় -> ঢ়
    .replace(/\u09AF\u09BC/g, 'য়') // য + ় -> য়
    .replace(/বরই/g, 'বড়ই')         // 'বরই' কে 'বড়ই' এ রূপান্তর
    .replace(/সুন্দর\s*বনের|সুন্দর\s*বন/g, 'সুন্দরবন')
    .replace(/এক\s*কেজি|১\s*কেজি|1\s*kg|1kg/gi, '১কেজি')
    .replace(/হাফ\s*কেজি|হাফ\s*কেজী|৫০০\s*গ্রাম|500g|500\s*gram/gi, '৫০০গ্রাম')
    .toLowerCase()
    .trim();
}

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

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

async function sendTextMessage(senderPsid, text) {
  const requestBody = {
    recipient: { id: senderPsid },
    message: { text: text }
  };

  try {
    await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
  } catch (err) {
    console.error('Error sending message:', err);
  }
}

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

        // ফোন নম্বর ডিটেকশন
        const normalizedPhoneText = convertBengaliToEnglishNumbers(messageText).replace(/[\s-]/g, '');
        const phoneRegex = /(01[3-9]\d{8})/;
        const isPhoneProvided = phoneRegex.test(normalizedPhoneText);

        const isOrderKeyword = cleanUserText.includes("অর্ডার") || cleanUserText.includes("কিনব") || cleanUserText.includes("নিতে চাই") || cleanUserText.includes("order");
        const isGreeting = cleanUserText === "হাই" || cleanUserText === "হ্যালো" || cleanUserText === "hi" || cleanUserText === "hello" || cleanUserText.includes("আসসালামু") || cleanUserText === "hey";
        const isChartAsk = cleanUserText.includes("চার্ট") || cleanUserText.includes("মূল্য তালিকা") || cleanUserText.includes("মূল্যতালিকা") || cleanUserText.includes("প্রাইস লিস্ট") || cleanUserText.includes("সকল পণ্য") || cleanUserText.includes("সব পণ্য") || cleanUserText.includes("লিস্ট") || cleanUserText.includes("chart");
        const isDiscountAsk = cleanUserText.includes("কমানো") || cleanUserText.includes("কম রাখা") || cleanUserText.includes("কম হবে") || cleanUserText.includes("ডিসকাউন্ট") || cleanUserText.includes("ছাড়") || cleanUserText.includes("discount") || cleanUserText.includes("কম নিয়েন") || cleanUserText.includes("কম রাখা যাবে");
        const isPriceAsk = cleanUserText.includes("দাম") || cleanUserText.includes("কত") || cleanUserText === "মధు" || cleanUserText === "modhu" || cleanUserText === "honey";
        const isComboAsk = cleanUserText === "কম্বো" || cleanUserText === "কম্বো প্যাক" || cleanUserText === "অফার";

        // ১. কাস্টমার ফোন নম্বর ও ঠিকানা পাঠালে
        if (isPhoneProvided) {
          const session = userSessions[senderPsid] || {};
          session.pendingInfo = messageText;

          const matched = session.matchedProducts || [];

          let singleSelectedProduct = null;
          if (matched.length === 1) {
            singleSelectedProduct = matched[0];
          } else if (matched.length > 1) {
            if (cleanUserText.includes("১কেজি")) {
              singleSelectedProduct = matched.find(p => normalizeBengaliText(p.name).includes("১কেজি"));
            } else if (cleanUserText.includes("৫০০গ্রাম")) {
              singleSelectedProduct = matched.find(p => normalizeBengaliText(p.name).includes("৫০০গ্রাম"));
            }
          }

          if (singleSelectedProduct) {
            const productPrice = parseFloat(singleSelectedProduct.price.toString().replace(/[^0-9.]/g, '')) || 0;
            const totalPrice = productPrice + DELIVERY_CHARGE;

            replyMessage = `🎉 আপনার অর্ডারটি সফলভাবে গ্রহণ করা হয়েছে!\n\n` +
                           `📦 অর্ডারের বিবরণ:\n` +
                           `• পণ্য: ${singleSelectedProduct.name}\n` +
                           `• মূল্য: ৳${productPrice}\n` +
                           `• ডেলিভারি চার্জ: ৳${DELIVERY_CHARGE}\n` +
                           `──────────────────\n` +
                           `💰 সর্বমোট বিল (ক্যাশ অন ডেলিভারি): ৳${totalPrice}\n\n` +
                           `📝 আপনার দেওয়া তথ্য:\n${messageText}\n\n` +
                           `আমাদের প্রতিনিধি কল করে আপনার অর্ডারটি নিশ্চিত করবেন। ধন্যবাদ 'প্রাকৃতিক স্বাদ'-এর সাথে থাকার জন্য! 🌿\n\n` +
                           `📞 হেল্পলাইন/হোয়াটসঅ্যাপ: 01335556732`;

            delete userSessions[senderPsid];
          } else if (matched.length > 1) {
            userSessions[senderPsid] = session;
            let optionsText = matched.map(p => `• ${p.name} - ৳${p.price}`).join('\n');
            replyMessage = `🎉 আপনার নাম, ঠিকানা ও মোবাইল নম্বর আমরা পেয়েছি!\n\n` +
                           `অনুগ্রহ করে জানান আপনি কোন সাইজটি নিতে চাচ্ছেন?\n${optionsText}\n\n` +
                           `সাইজটি (যেমন: '১ কেজি' বা '৫০০ গ্রাম') জানালেই আমরা অর্ডার নিশ্চিত করে দেবো।`;
          } else {
            userSessions[senderPsid] = session;
            replyMessage = `🎉 আপনার নাম, ঠিকানা ও মোবাইল নম্বর আমরা পেয়েছি!\n\n` +
                           `স্যার, আপনি কোন পণ্যটি এবং কতটুকু (যেমন: 'সুন্দরবনের মধু ১ কেজি' বা 'গাওয়া ঘি') নিতে চাচ্ছেন? অনুগ্রহ করে নির্দিষ্ট নাম ও সাইজটি জানান।`;
          }

        } else if (isGreeting) {
          replyMessage = `আসসালামু আলাইকুম! 'প্রাকৃতিক স্বাদ'-এ আপনাকে স্বাগতম। 🌿\n\n` +
                         `আমাদের ১০০% খাঁটি প্রাকৃতিক পণ্যগুলোর দাম জানতে মেসেজ দিন:\n` +
                         `• 'মূল্য তালিকা' বা 'চার্ট' (সব পণ্যের তালিকা দেখতে)\n` +
                         `• 'সরিষা ফুল', 'কালোজিরা', 'বড়ই ফুল' বা 'সুন্দরবন'\n` +
                         `• 'কম্বো প্যাক' (বিশেষ অফারগুলো দেখতে)\n\n` +
                         `স্যার, আপনি কোন পণ্যটি নিতে চাচ্ছেন?\n` +
                         `🌐 ওয়েবসাইট: https://prokritikshad.com`;

        } else if (isDiscountAsk) {
          replyMessage = `স্যার, আমরা ১০০% খাঁটি ও প্রিমিয়াম কোয়ালিটির প্রাকৃতিক পণ্য সরাসরি উৎস থেকে সংগ্রহ করে একদম ন্যায্যমূল্যে সরবরাহ করি। তাই আমাদের পণ্যের দাম নির্ধারিত। 🌿\n\n` +
                         `তবে আপনি যদি অফারে সাশ্রয়ী মূল্যে নিতে চান, আমাদের বিশেষ কম্বো প্যাকগুলো দেখতে পারেন!\n\n` +
                         `🎁 কম্বো অফার দেখতে 'কম্বো' লিখে মেসেজ দিন।\n` +
                         `🌐 অথবা ওয়েবসাইটে ভিজিট করুন: https://prokritikshad.com`;

        } else if (isChartAsk) {
          const products = await fetchProductsFromWebsite();

          if (products && Array.isArray(products) && products.length > 0) {
            replyMessage = `📜 'প্রাকৃতিক স্বাদ' - পণ্যের মূল্য তালিকা 🌿\n` +
                           `═════════════════════\n\n`;

            products.forEach((p, index) => {
              replyMessage += `🔹 ${index + 1}. ${p.name}\n` +
                              `   💰 মূল্য: ৳${p.price}\n\n`;
            });

            replyMessage += `═════════════════════\n` +
                           `🚚 ডেলিভারি চার্জ: ৳${DELIVERY_CHARGE}\n\n` +
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
                         `১. পণ্যের নাম ও সাইজ (যেমন: ১ কেজি / ৫০০ গ্রাম):\n` +
                         `২. আপনার নাম:\n` +
                         `৩. মোবাইল নম্বর:\n` +
                         `৪. পূর্ণাঙ্গ ঠিকানা:\n\n` +
                         `🚚 ক্যাশ অন ডেলিভারি চার্জ: ৳${DELIVERY_CHARGE}\n` +
                         `🌐 অথবা ওয়েবসাইটে সরাসরি অর্ডার করুন: https://prokritikshad.com`;

        } else {
          // স্মার্ট প্রোডাক্ট সার্চ ও ফিল্টারিং
          const products = await fetchProductsFromWebsite();

          if (products && Array.isArray(products) && products.length > 0) {
            
            if (isComboAsk) {
              const comboProducts = products.filter(p => {
                if (!p.name) return false;
                const cleanName = normalizeBengaliText(p.name);
                return cleanName.includes("কম্বো") || cleanName.includes("প্যাক") || cleanName.includes("ফ্রি") || cleanName.includes("+") || cleanName.includes("অফার");
              });

              if (comboProducts.length > 0) {
                userSessions[senderPsid] = { matchedProducts: comboProducts };
                replyMessage = `আমাদের স্পেশাল কম্বো প্যাক ও অফারসমূহ:\n\n`;
                comboProducts.forEach(p => { replyMessage += `• ${p.name} - ৳${p.price}\n\n`; });
                replyMessage += `🚚 ডেলিভারি চার্জ: ৳${DELIVERY_CHARGE}\n\n📦 অর্ডার করতে আপনার নাম, ঠিকানা ও মোবাইল নম্বর লিখে দিন।`;
              } else {
                replyMessage = `আমাদের সাধারণ পণ্যসমূহ দেখতে 'মূল্য তালিকা' লিখে মেসেজ দিন।\n\n🌐 পুরো ওয়েবসাইট ব্রাউজ করুন: https://prokritikshad.com`;
              }

            } else if (isPriceAsk && !cleanUserText.includes("সরিষা") && !cleanUserText.includes("কালোজিরা") && !cleanUserText.includes("সুন্দরবন") && !cleanUserText.includes("খলিশা") && !cleanUserText.includes("বড়ই") && !cleanUserText.includes("বরই") && !cleanUserText.includes("ঘি") && !cleanUserText.includes("গুড়")) {
              replyMessage = `স্যার, আপনি কোন মধুটি নিতে চাচ্ছেন? আমাদের কাছে পাওয়া যাচ্ছে:\n\n` +
                             `• সরিষা ফুলের মধু\n` +
                             `• কালোজিরা ফুলের মধু\n` +
                             `• সুন্দরবনের মধু\n` +
                             `• খলিশা ফুলের মধু\n` +
                             `• বড়ই ফুলের মধু\n` +
                             `• স্পেশাল কম্বো প্যাক (অফার)\n\n` +
                             `আপনার পছন্দের নাম লিখে জানান অথবা সব পণ্যের দাম দেখতে 'মূল্য তালিকা' লিখে মেসেজ দিন।`;

            } else {
              // টাইপ এবং সাইজ সার্চ
              const flowerKeywords = ["সুন্দরবন", "সরিষা", "কালোজিরা", "খলিশা", "বড়ই", "বরই", "ঘি", "গুড়", "কম্বো"];
              const matchedFlowers = flowerKeywords.filter(f => cleanUserText.includes(f));
              
              const is1kg = cleanUserText.includes("১কেজি");
              const is500g = cleanUserText.includes("৫০০গ্রাম");

              let matchedProducts = [];

              if (matchedFlowers.length > 0) {
                let flowerFiltered = products.filter(p => {
                  if (!p.name) return false;
                  const cleanPName = normalizeBengaliText(p.name);
                  return matchedFlowers.some(f => cleanPName.includes(f));
                });

                if (is1kg) {
                  const sizeFiltered = flowerFiltered.filter(p => normalizeBengaliText(p.name).includes("১কেজি"));
                  if (sizeFiltered.length > 0) flowerFiltered = sizeFiltered;
                } else if (is500g) {
                  const sizeFiltered = flowerFiltered.filter(p => normalizeBengaliText(p.name).includes("৫০০গ্রাম"));
                  if (sizeFiltered.length > 0) flowerFiltered = sizeFiltered;
                }

                matchedProducts = flowerFiltered;

              } else {
                // কি-ওয়ার্ড ডায়নামিক ফিল্টার (ফ্ল্যাঙ্কব্যাক)
                const stopWords = ["ফুলের", "মধু", "এর", "দাম", "কত", "চাই", "নেব", "অর্ডার", "কেজি", "গ্রাম", "১কেজি", "১", "কেজী", "পণ্য"];
                const searchWords = cleanUserText.split(/\s+/).filter(w => w.length > 1 && !stopWords.includes(w));

                matchedProducts = products.filter(p => {
                  if (!p.name) return false;
                  const cleanProductName = normalizeBengaliText(p.name);
                  if (cleanProductName.includes(cleanUserText) || cleanUserText.includes(cleanProductName)) return true;
                  if (searchWords.length > 0) return searchWords.some(word => cleanProductName.includes(word));
                  return false;
                });
              }

              if (matchedProducts.length > 0) {
                const session = userSessions[senderPsid] || {};

                if (session.pendingInfo) {
                  const chosenProduct = matchedProducts[0];
                  const productPrice = parseFloat(chosenProduct.price.toString().replace(/[^0-9.]/g, '')) || 0;
                  const totalPrice = productPrice + DELIVERY_CHARGE;

                  replyMessage = `🎉 আপনার অর্ডারটি সফলভাবে গ্রহণ করা হয়েছে!\n\n` +
                                 `📦 অর্ডারের বিবরণ:\n` +
                                 `• পণ্য: ${chosenProduct.name}\n` +
                                 `• মূল্য: ৳${productPrice}\n` +
                                 `• ডেলিভারি চার্জ: ৳${DELIVERY_CHARGE}\n` +
                                 `──────────────────\n` +
                                 `💰 সর্বমোট বিল (ক্যাশ অন ডেলিভারি): ৳${totalPrice}\n\n` +
                                 `📝 আপনার দেওয়া তথ্য:\n${session.pendingInfo}\n\n` +
                                 `আমাদের প্রতিনিধি কল করে আপনার অর্ডারটি নিশ্চিত করবেন। ধন্যবাদ 'প্রাকৃতিক স্বাদ'-এর সাথে থাকার জন্য! 🌿\n\n` +
                                 `📞 হেল্পলাইন/হোয়াটসঅ্যাপ: 01335556732`;
                  
                  delete userSessions[senderPsid];
                } else {
                  userSessions[senderPsid] = { matchedProducts: matchedProducts };
                  
                  replyMessage = `আমাদের উপলব্ধ সবকটি সাইজ ও মূল্য তালিকা:\n\n`;
                  matchedProducts.forEach(p => { replyMessage += `• ${p.name} - ৳${p.price}\n\n`; });
                  replyMessage += `🚚 ডেলিভারি চার্জ: ৳${DELIVERY_CHARGE}\n\n` +
                                  `📦 অর্ডার করতে আপনার নাম, মোবাইল নম্বর, পূর্ণাঙ্গ ঠিকানা এবং কাঙ্ক্ষিত পণ্যটি লিখে মেসেজ দিন।\n` +
                                  `🌐 অথবা ওয়েবসাইটে সরাসরি অর্ডার করুন: https://prokritikshad.com`;
                }

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
