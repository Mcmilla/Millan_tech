# PoaStock prototype

PoaStock is a front-end demonstration of a pharmaceutical wholesaler's order-to-payment-to-delivery workflow. The sample data and all changes are stored locally in the browser.

## Run it

Open `prototype/index.html` in a modern browser. No package installation, server, or API credentials are required. If the browser blocks local storage for directly opened files, serve the project folder with any local static-file server.

## Demo workflow

1. Create an order for a pharmacy and select products and quantities.
2. Confirm the order from the Orders page using the row action.
3. Request an M-Pesa payment and choose **Simulate payment**.
4. Mark the paid order as dispatched, then mark it delivered.
5. Add a product or pharmacy from the corresponding page.

The demo payment action records a clearly labeled fake receipt in browser storage. It does **not** connect to Safaricom, send an STK Push, collect a PIN, or transfer money. Use the reset instructions to restore the sample data.

## Reset sample data

In the browser developer console, run:

```js
localStorage.removeItem("poastock-prototype-v1");
location.reload();
```

## Suggested project structure

```text
Pharmatech/
  docs/
    prototype.md
  prototype/
    index.html
    css/
      styles.css
    js/
      app.js
```

The existing `backend/`, `database/`, `integrations/mpesa/`, and `tests/` folders are reserved for the next implementation stage. A live M-Pesa integration must be performed server-side using an approved Daraja business setup, protected credentials, verified callbacks, and payment reconciliation. Do not place Daraja secrets in this static prototype.

## Prototype limitations

- No backend, authentication, role permissions, or shared multi-user data.
- Stock and customer data are demonstration records, not a validated pharmaceutical catalogue.
- Stock is not decremented when an order is created; a wholesaler should confirm availability before accepting an order.
- No regulatory checks, tax invoices, credit accounting, delivery routing, or clinical advice.

## Pain points it’s designed to address
For a pharmaceutical wholesaler, the prototype demonstrates:

Orders scattered across calls or messages: puts orders into a single list.
Order-entry confusion: records the pharmacy, products, quantities, and total together.
Unclear payment follow-up: shows which orders are awaiting payment and records a demo payment result.
Uncertainty about delivery progress: lets staff move orders through paid, dispatched, and delivered statuses.
Missed restocking needs: highlights low-stock and out-of-stock catalogue items.
Hard-to-find customer history: lists pharmacies, contacts, and past orders.
## How to show it to a potential customer
Ask them to describe how they currently receive, confirm, and track orders.
Show a matching example: create an order, confirm it, simulate payment, and update delivery.
Ask what would not fit their actual process and what they’d change.
Ask whether they’d try it with a few existing pharmacy customers.