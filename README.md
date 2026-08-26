# reconnAIssance

A merchant using Razorpay receives money through many channels and touchpoints — customer payments, refunds, partial settlements — and this money passes through several independent records before it is confirmed as "received": the merchant's own sales ledger, Razorpay's settlement reports, and the merchant's bank statement. These three records almost never match perfectly on their own, because of timing lags, deducted fees, partial refunds, human data-entry error, and formatting inconsistencies between systems.

Today, a finance/ops person manually opens two or three spreadsheets, eyeballs rows, and tries to pair them up by hand. This is slow, error-prone, and does not scale as transaction volume grows. It is also one of the least-loved jobs in any finance team.

Learning note: this manual process is called "reconciliation" or "recon" in finance teams everywhere, not just at Razorpay-powered merchants — the same pattern exists at every company that takes in money through more than one system.
