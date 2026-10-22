# 选课费 · Stripe 接入（订单流程 v3 第二批，2026-10-22 建成）

承接 `fengchao-order-flow-review-v2.md`「第二批 提交记录与 Stripe」。本次已建：提交记录 + 占座、Stripe Checkout、webhook、完成页轮询、未付返回即释放、夜间核对、选课费退款记账。**未建**：付费时自动建 @fengchao.life 账号 / 取消或过期时删账号（下一小批，需 Graph 建用户与 SSPR）。

## 开关：不设密钥就完全不影响现有流程

收费只在 **`SELECTION_FEE_CENTS` 和 `STRIPE_SECRET_KEY` 都设了** 时生效（`fee.activeFee()`）。缺一个：下单与以前完全相同——提交即建单、编号、通知；订单 `fee = null`；网站不显示选课费。测试：`test/selection-fee.test.js`（先验证关闭时行为不变）、`test/site-fee.test.js`（网站两种情况）。

Rick 2026-10-22：页面只写「选课费 USD 1」，不提手续费，按钮不显示金额——即 `SELECTION_FEE_CENTS = 100`，Stripe 手续费由蜂巢承担（取代 10-21 的「付款人承担、标价 1.34」）。

## 流程（收费时）

1. 网站下单页显示「选课费 USD 1，提交后在 Stripe 安全付款页支付」，按钮仍是「提交订单」。
2. `POST /api/order`：校验、定价、座位检查与以前相同；然后**不建单**，存提交记录 `crm/submissions/FS-*.json`（status `held`，购物车、邮箱、联系人、语言、`holdUntil` ≈ 36 分钟），开 Stripe Checkout（`customer_email` 锁定、`allow_promotion_codes`、metadata `submission`、31 分钟过期、按提交号幂等），回 `{ checkout, submission, fee }`，网站跳到 Stripe。购物车保留到付款确认。
3. 占座：未过期的 held 提交计入「保留」座位（`submissions.heldAsOrders()` → `seats.countOrders`），下单检查和公开 `/api/seats` 都算——付款中的最后一个座位不会被别人抢走。索引 `crm/submissions/_open.json`。
4. 付款成功 → Stripe webhook `checkout.session.completed`（或 `async_payment_succeeded`）→ `finalizeSubmission()`：此时才编号、建机构订单、通知（Teams + 家长邮件，一次），订单 `fee = { status: paid | waived(优惠码全免), receiptUrl, coupon, paymentIntentId, test }`。幂等：重复投递不重复建单、不重复通知。
5. 网站完成页 `/done?submission=…` 轮询 `GET /api/order/status?submission=`：先「正在确认付款…」，到 paid 后显示订单号和「选课费收据」；webhook 迟到时轮询自己向 Stripe 查询并完成。
6. 未付款返回 `/order?payment=cancelled&submission=…`：页面提示「付款未完成，订单尚未提交」，并 `POST /api/order/status {submission, email, action: release}`（邮箱须一致）→ 关闭 Stripe 会话、提交记为 `abandoned`、立即释放座位。
7. 会话过期（`checkout.session.expired`）→ `abandoned`。夜间 `crm-sweep` 第 6 步：过了占座时间的提交向 Stripe 核对——已付补建订单，未付标 `abandoned` 并关闭会话。
8. 选课费退款只在 Stripe 后台人工做（重复扣款、争议）；`charge.refunded` 记到提交和订单的 `fee.status`（refunded / partially_refunded），订单状态不动——课程费与蜂巢无关。

管理中心：订单面板显示「选课费 USD 1 · 已付 · 收据」（机构负责人看不到）；我的订单同样显示。

## 新端点

- `GET /api/order/status` → `{ fee: {amount, currency, label} | null, test }`；`?submission=` → 状态、订单号、选课费；`POST {submission, email, action: "release"}`。匿名。
- `POST /api/stripe/webhook`（验签 `Stripe-Signature`，5 分钟容差）。匿名。
- 代码：`api/shared/stripe.js`（无 SDK，fetch + 表单编码 + HMAC）、`api/shared/submissions.js`、`api/order/index.js`（`buildOrders`、`holdForPayment`、`finalizeSubmission`）、`api/order-status`、`api/stripe-webhook`、`api/shared/sweep.js` 第 6 步。

## Rick 要做的（密钥只填 Azure，不经对话）

1. 注册 Stripe（账户所在国决定可用收款方式；描述符 FENGCHAO）。先用**测试模式**。
2. Stripe 后台 › Developers › Webhooks：添加端点 `https://www.fengchao.life/api/stripe/webhook`，事件 `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`、`checkout.session.expired`、`charge.refunded`；复制签名密钥 `whsec_…`。
3. Azure Static Web App › 环境变量：`STRIPE_SECRET_KEY = sk_test_…`、`STRIPE_WEBHOOK_SECRET = whsec_…`、`SELECTION_FEE_CENTS = 100`（可选 `SELECTION_FEE_CURRENCY = usd`、`ORDER_HOLD_MINUTES = 30`、`SITE_ORIGIN`）。三项齐了才开始收费；删掉 `SELECTION_FEE_CENTS` 立刻关闭。
4. 用测试卡 4242 4242 4242 4242 下几单（含优惠码、中途返回、放着让它过期），看订单、邮件、收据；页面会标「测试模式」。跑一周后换 `sk_live_…` 和正式 webhook 的 `whsec_…`。
5. 可选：Stripe 后台建优惠码（100% 折扣的用于停开补偿）；开启收据邮件。
