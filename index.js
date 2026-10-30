const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());

// ওয়েবসাইট থেকে প্রোডাক্টের লাইভ তথ্য আনার ফাংশন
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

// মেসেঞ্জারের মূল মেসেজ প্রসেসিং
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    for (const entry of body.entry) {
      const webhookEvent = entry.messaging[0];
      const senderPsid = webhookEvent.sender.id;

      if (webhookEvent.message && webhookEvent.message.text) {
        const messageText = webhookEvent.message.text.toLowerCase();
        let replyMessage = "";

        // ওয়েবসাইট থেকে লাইভ তথ্য রিড করা
        const products = await fetchProductsFromWebsite();

        if (products && products.length > 0) {
          // কাস্টমার যে শব্দ লিখবে তা দিয়ে প্রোডাক্ট ফিল্টার
          const matchedProducts = products.filter(p => 
            p.name.toLowerCase().includes(messageText)
          );

          if (matchedProducts.length > 0) {
            replyMessage = "আমাদের পাওয়া যাচ্ছে:\n\n";
            matchedProducts.forEach(p => {
              replyMessage += `• ${p.name} - ৳${p.price}\n`;
            });
            replyMessage += "\nঅর্ডার করতে সরাসরি ভিজিট করুন: https://prokritikshad.com";
          } else {
            replyMessage = "আসসালামু আলাইকুম! প্রাকৃতিক স্বাদ পেজে আপনাকে স্বাগতম। পণ্য ও দাম জানতে 'মধু', 'ঘি' বা 'গুড়' লিখে মেসেজ দিন। অথবা বিস্তারিত দেখুন: https://prokritikshad.com";
          }
        } else {
          replyMessage = "ধন্যবাদ মেসেজ দেওয়ার জন্য! আমাদের সব পণ্যের দাম ও তথ্য জানতে ব্রাউজ করুন: https://prokritikshad.com";
        }

        // মেসেঞ্জারে উত্তর পাঠানো
        await sendTextMessage(senderPsid, replyMessage);
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});
