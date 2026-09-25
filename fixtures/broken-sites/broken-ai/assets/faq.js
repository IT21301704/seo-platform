// FAQ answers are only added by JavaScript, so they are missing from the raw HTML.
const faqs = [
  [
    "Are your mugs dishwasher and microwave safe?",
    "Yes. All our mugs are high-fired stoneware with food-safe, lead-free glazes, so they are safe in the dishwasher and the microwave."
  ],
  [
    "How long does delivery take within Sri Lanka?",
    "Orders usually arrive in two to four working days. Delivery costs LKR 750 and is free for orders over LKR 15,000."
  ],
  [
    "Can I return a mug?",
    "Yes. You can return unused mugs within 14 days of delivery for a full refund. Custom orders cannot be returned unless they arrive damaged."
  ],
  [
    "What if my mug arrives broken?",
    "Send us a photo within 48 hours of delivery and we will send a replacement or a full refund at no cost to you."
  ],
  [
    "Do you ship outside Sri Lanka?",
    "Not yet. We currently deliver only within Sri Lanka, but you can collect orders from our studio in Galle Fort."
  ],
  [
    "Do I need experience to join a pottery workshop?",
    "No. The workshop is made for beginners, and all clay, tools and aprons are included in the price."
  ]
];
const list = document.getElementById("faq-list");
for (const [question, answer] of faqs) {
  const h2 = document.createElement("h2");
  h2.innerHTML = question;
  const p = document.createElement("p");
  p.innerHTML = answer;
  list.append(h2, p);
}
