# SokoKisii marketplace prototype

A mobile-friendly concept demo for a local-shopping marketplace in Kisii Town. It is intended for customer and shop-owner interviews, not for live sales.

## Run the prototype

Open `index.html` in a modern browser. No installation or internet connection is required for the app logic. A network connection is used only to load optional web fonts; the page has system-font fallbacks.

## Demo features

- Browse sample listings across fashion, phones and tech, beauty, home, and food.
- Filter by category or sample shop; search listing names, descriptions, and shops.
- Add sample items to a basket, change quantities, and choose pickup or local delivery.
- Preview a demo checkout and register sample seller interest.
- Preview a direct-to-shop WhatsApp enquiry for a product. It opens a WhatsApp chat only when a participating shop has a valid, permission-approved number configured.
- View the review panel on each product. It shows no fabricated testimonials; real reviews should be enabled only after a completed purchase can be verified.
- The basket persists in this browser using local storage.

## Important limitations

All listed shops and products are illustrative sample data. Sample shops have no WhatsApp numbers configured, so the enquiry preview will not send a message. To enable a real WhatsApp enquiry, add a verified Kenyan number to the matching shop's `whatsapp` field in `js/app.js` only after the shop owner gives permission to publish it. The prototype does not check live stock, create confirmed orders, process M-Pesa or other payments, coordinate delivery, or save seller/customer details to a business system. Do not represent the demo as a functioning marketplace. Confirm real seller participation, product prices, inventory, pickup/delivery arrangements, and customer demand before building those capabilities.

The review panel intentionally contains no fake ratings or testimonials. This prototype cannot verify purchases or moderate customer feedback. A live version should collect reviews only after a completed order and provide a way to report abusive or misleading content.

To clear the saved sample basket, run `localStorage.removeItem("sokokisii-demo-v1")` in the browser developer console and reload the page.
