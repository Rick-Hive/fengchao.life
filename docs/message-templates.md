# Order messages: how the wording is edited

Every order produces up to four messages. The **API composes all of them** and
hands Power Automate finished text; the flow only delivers it. The **wording**
lives in an Airtable table so it can be changed without a deploy.

| Message | Audience | Template key | Delivered as |
|---|---|---|---|
| Order confirmation | the family | `order_confirmation` | email to the address on the order |
| New-order notification | the hive | `order_notification` | Teams post to the hive's channel **and** email to its Notify Email |

Both are rendered in **the language the family ordered in** — Chinese by
default, English if they switched the site to EN. Course names, dates, money
formatting and the "reply within N working days" promise all follow that choice.

## Where wording comes from

```
Airtable "Message Templates/消息模板" row   →  wins
        ↓ (row missing, or that cell blank)
Built-in default in api/shared/messages.js →  fallback
```

Precedence is **per cell**, not per row: fill in only `Subject` and the default
`Body` is still used. The table is optional — if it doesn't exist, sync logs a
warning and everything uses the built-in defaults, which are the same text
printed below.

## The Airtable table

Create a table named exactly **`Message Templates/消息模板`** with four columns:

| Column | Type | Contents |
|---|---|---|
| `Key` | Single line text | `order_confirmation` or `order_notification` |
| `Language` | Single select | `zh` or `en` |
| `Subject` | Single line text | email subject (also the Teams email subject) |
| `Body` | Long text | the message, plain text with `{{placeholders}}` |

Four rows total: each key × each language. Write `Body` as **plain text** — no
HTML. Line breaks are preserved, and the email version is wrapped in simple
formatting automatically.

## Placeholders

| Placeholder | Renders as |
|---|---|
| `{{orderId}}` | `FC-20260901-KXC-001` |
| `{{submittedAt}}` | `2026/09/01 10:10（北京时间）` |
| `{{email}}` | the family's email address |
| `{{teamsAccount}}` | their Teams account, or `（未填写）` / `(not provided)` |
| `{{langName}}` | `中文` or `English` — which language to reply in |
| `{{trackName}}` | `K-G8 Courses/小学·初中课程` |
| `{{itemCount}}` | number of courses |
| `{{courseList}}` | one course per line: `• SCI-EL-401 科学革命 — ¥3,500` |
| `{{totalPrice}}` | `¥3,500` in Chinese, `CNY 3,500` in English |
| `{{currency}}` | `CNY` |
| `{{schoolNames}}` | the institution(s) owning the courses |
| `{{replyDays}}` | `2` — the working-days promise |

An unknown placeholder renders as nothing rather than showing `{{typo}}` to a
customer, so check spelling against this table.

## Per-hive scoping

A family can order courses from several institutions in one submission. Each
hive's notification is built from **only its own courses**, so `{{courseList}}`,
`{{itemCount}}` and `{{totalPrice}}` in `order_notification` mean *that hive's*
courses and subtotal — never the whole order. The family's confirmation email
lists everything.

The same template text serves every hive; there is no per-hive wording.

---

# Ready-to-paste rows

## Row 1 — `order_confirmation` / `zh`

**Subject**

```
【蜂巢】订单确认 {{orderId}}｜已收到您的选课
```

**Body**

```
您好，

感谢您通过蜂巢选课。您的订单已经收到，以下是订单详情，请您核对：

订单编号：{{orderId}}
提交时间：{{submittedAt}}
教育路径：{{trackName}}

所选课程（共 {{itemCount}} 门）：
{{courseList}}

合计：{{totalPrice}}

接下来会发生什么
课程所属机构（{{schoolNames}}）将在 {{replyDays}} 个工作日内直接与您联系，与您确认开课时间、付款方式与入学手续。付款与入学由课程所属机构与您单独完成，蜂巢不代收任何费用。

如超过 {{replyDays}} 个工作日仍未收到联系，请直接回复本邮件并注明订单编号，我们会为您跟进。

蜂巢
以线上资源推动C教育生态重建
https://www.fengchao.life
```

## Row 2 — `order_confirmation` / `en`

**Subject**

```
[Hive] Order confirmation {{orderId}} — we have your course selection
```

**Body**

```
Hello,

Thank you for choosing courses through Hive. Your order has been received. Please check the details below:

Order number: {{orderId}}
Submitted: {{submittedAt}}
Track: {{trackName}}

Courses selected ({{itemCount}}):
{{courseList}}

Total: {{totalPrice}}

What happens next
The institution offering these courses ({{schoolNames}}) will contact you directly within {{replyDays}} working days to confirm the start date, payment and enrolment. Payment and enrolment are handled between you and that institution; Hive does not collect fees.

If you have not heard from anyone within {{replyDays}} working days, reply to this email with your order number and we will follow up for you.

Hive
Rebuilding the C-education ecosystem through online resources
https://www.fengchao.life
```

## Row 3 — `order_notification` / `zh`

**Subject**

```
新订单 {{orderId}}｜{{itemCount}} 门课程｜{{totalPrice}}
```

**Body**

```
🐝 新订单 {{orderId}}

家长联系方式
· 邮箱：{{email}}
· Teams：{{teamsAccount}}
· 沟通语言：{{langName}}

订单信息
· 提交时间：{{submittedAt}}
· 教育路径：{{trackName}}
· 所属机构：{{schoolNames}}

课程明细（共 {{itemCount}} 门）
{{courseList}}

合计：{{totalPrice}}

请在 {{replyDays}} 个工作日内联系家长，确认开课时间、付款方式与入学手续。
家长已收到自动确认邮件，并已被告知由贵机构直接联系。
```

## Row 4 — `order_notification` / `en`

**Subject**

```
New order {{orderId}} — {{itemCount}} course(s) — {{totalPrice}}
```

**Body**

```
🐝 New order {{orderId}}

Family contact
· Email: {{email}}
· Teams: {{teamsAccount}}
· Preferred language: {{langName}}

Order
· Submitted: {{submittedAt}}
· Track: {{trackName}}
· Institution: {{schoolNames}}

Courses ({{itemCount}})
{{courseList}}

Total: {{totalPrice}}

Please contact the family within {{replyDays}} working days to confirm the start date, payment and enrolment.
They have already received an automatic confirmation email telling them you will be in touch.
```

---

# Per-hive delivery setup

Two columns on the **Schools/institutions** table decide where a hive's orders go:

| Column | Contents |
|---|---|
| `Teams Channel ID` | the channel's id, e.g. `19:1f4c…e7@thread.tacv2` |
| `Notify Email` | the address that should also receive the notification |

Either, both, or neither. A hive with **neither** still produces a route with
empty destinations, which the flow sends to the default channel — an order can
never silently vanish because a cell was left blank. Sync raises a warning
listing any such hive.

**Both columns are private.** They are synced into `snapshot.private`, which
`/api/data` strips before the snapshot reaches a browser. Do not move them into
the course or school objects that the public site reads.

## Getting a channel ID

In Teams, right-click the channel → **Get link to channel**. The link looks like:

```
https://teams.microsoft.com/l/channel/19%3A1f4c…e7%40thread.tacv2/General?groupId=…
```

Take the segment between `/channel/` and the next `/`, and **URL-decode it**:

- `%3A` → `:`
- `%40` → `@`

So `19%3A1f4c…e7%40thread.tacv2` is stored as `19:1f4c…e7@thread.tacv2`.

The `groupId` in that same link is the Team id. All hive channels live in one
Team, so the flow can keep the Team picked from its dropdown and only the
channel needs to be dynamic.

## What the flow does with it

The payload carries a `routes` array — one entry per hive in the order:

```
routes[]
  schoolName, schoolAbbr, hiveKey
  teamsChannelId, notifyEmail      ← destinations
  itemCount, subtotal, currency
  notifyText, notifySubject, notifyHtml
```

So the flow is:

1. **Apply to each** `routes`
2. **Post message in a chat or channel** — Channel set to *Enter custom value*
   `teamsChannelId` (fall back to the default channel when it is empty), message
   `notifyText`
3. **Send an email (V2)** — To `notifyEmail` (skip when empty), Subject
   `notifySubject`, Body `notifyHtml`
4. After the loop, **Send an email (V2)** to the family — To `emailTo`, Subject
   `emailSubject`, Body `emailHtml`

Regenerate the trigger's Request Body JSON Schema from
`docs/order-flow-sample-payload.json` whenever the payload gains fields, or the
flow will not offer them as dynamic content.
