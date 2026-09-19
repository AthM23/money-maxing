# Judge Interview — 2026-09-19

Conversation with a judge/sponsor rep from the finance-agents company running this
track. This is the clearest statement we have of what they want built and how
they'll score it. **Treat the summary below as the design brief.**

> ⚠️ The raw transcript at the bottom is machine-transcribed and lossy. Proper
> nouns are mangled ("Maximore/Maximor" = the company; "New York" ≈ "an org";
> "familiar and above" ≈ "Series A and above"). Where the summary and the
> transcript disagree, the summary reflects our reading of intent — flag it if
> you think we read it wrong.

---

## 1. The core thesis

**Analyzing and preparing financial statements is the *terminal* step, and it's
not the hard part.** The hard part — the part they want automated — is everything
upstream: collecting context that is scattered across people, internal and
external systems, and ad-hoc processes, and getting it correctly booked.

Their words, roughly: *"All the work that comes before it — collecting all the
context spread across people, internal/external processes, systems, and booking
it in your books — that is the part we're trying to automate."*

## 2. How a finance org actually decomposes

Finance is not one function, the same way engineering isn't. It splits into
teams that are distinct but tightly coupled:

- Collections
- Cash
- Revenue
- Payroll
- Equity

**Worked example — the revenue lifecycle:**

1. Sales rep negotiates the contract (amount, terms, discounts).
2. Accounting issues invoices on a timely cadence.
3. Collections chases payment.
4. Cash team books the payment when it lands.
5. Reporting rolls it into P&L / revenue statement / cash flow statement. ← terminal step

## 3. The context problem (their canonical failure story)

The CEO negotiates a discount with a customer over email. Nobody else knows —
it lives in the CEO's inbox.

- Customer underpays → revenue team is confused ("why are they underpaying?")
- Cash doesn't reconcile → cash team is confused ("why is there a $1,000 delta?")
- Everyone ends up chasing each other on Slack.

**The ask:** can the platform capture that context *continuously*, keep learning
the company's policies and processes, and **persist it** — so every *future*
invoice for that customer automatically carries the negotiated discount? The
memory layer is not a nice-to-have; it's the thesis.

## 4. What they want built in 24h

Two viable shapes:

- **Deep (realistic):** pick one function — e.g. revenue — and cover it
  end-to-end with one or more agents: contract → invoicing → email follow-up →
  the manual ops work in between.
- **Broad (ambitious, riskier):** cross-function — e.g. a cash agent that also
  talks to the payroll agent and the equity agent, aggregating across them.

**Autonomy is a hard requirement.** No human in the loop by default. A human is
pulled in *only* when an agent hits a genuine context blocker it cannot resolve.
When the human answers, the agent must **capture that answer in memory** and
apply it to all future work. That escalate-then-remember loop is the demo.

## 5. Judging dimensions (stated explicitly)

1. **Ambition** — depth in one function vs. breadth across functions. Breadth
   scores higher but is riskier.
2. **Proximity to the frontier** — are you using the right models, the right
   partners, the right memory layer?
3. **Difficulty of the process you chose** — see below.

### Difficulty ranking of finance functions

| Function | Difficulty | Why |
|---|---|---|
| Cash / reconciliation | **Easy** | Bank statement vs. books. Mostly a diff. Judge called it out as the simple one — likely a crowded choice. |
| Revenue end-to-end | Medium | Multi-step, multi-actor, lots of ops glue. |
| Collections | Medium | Email ops, follow-up loops, human-facing. |
| Payroll | Medium | |
| Equity | **Hard** | Requires knowing equity law, how cap tables work, state *and* federal regulation. Most context-hungry → highest ceiling on the difficulty axis. |

## 6. Target customer

- **Not** small startups that can't afford an accountant. That's the market for
  accounting/payroll BPOs — which is who they see as the competition.
- **Their customers: ~Series A and above**, because those orgs have the most
  complex and *distributed* finance organizations. Distribution is the pain.

## 7. Positioning — not replacement

They were explicit: this doesn't fire the revenue accountant. It moves them up
the stack — from doing the ops work to improving the revenue model, talking to
customers, building business systems on top. Their analogy: engineers moving
from writing code to doing system design and handing implementation off.

## 8. Context taxonomy (useful for designing the memory layer)

Three tiers, and the judge said a good system separates them:

1. **Universal** — bounded by law and regulation. Same for everyone.
2. **Vertical** — norms of the industry. Tech companies price differently than
   retail or manufacturing.
3. **Company-specific** — that business's own policies, customizations, and
   one-off deals (the CEO's email discount lives here).

---

## Implications for us

- Whatever we build must **show memory working**: a context gap → escalation →
  human answer → the answer silently applied on the *next* run, unprompted.
- Avoid pure cash reconciliation as the whole pitch — the judge flagged it as
  the easy one.
- Multi-agent, cross-function beats single-agent if we can make it hold together.
- Model the three context tiers explicitly. It's free points on the
  "understanding the domain" axis.
- Demo needs a believable ~Series A company as the fixture, not a two-person startup.

---

## Raw transcript

> Verbatim auto-transcription, uncorrected. Kept for fidelity — the summary above
> is the working artifact.

Hardware and such. Hey, guys. How's it going? Well, good. How are you? Doing well, doing well. We just wanted to ask you a couple questions. Yeah, sure. Yeah, so, I mean, I guess, like, from our city, like, with, like, Maximore, right? You guys, like the 4th thesis, I guess, is just like having Asians understand better and better at like analyzing your, I guess, like financial like statements. Like, can you talk a little bit more like kind of like how you guys think about it? Yes. So, I mean, every York is going to have multiple functions, right? For example, we understand the engineering function really well. And even within engineering, you have different team, the Italian team, there's a previous team, there's a security team, there's the testing team. Same for the opposite of the CA4, right? So there's a collections team. There's a cash team, there's a revenue team, there's a payroll team. And these are all different functions, but they are connected quite closely, right? To give you an example, just a simple process of collecting revenue from your customer. Their sales rep will negotiate the contract. certain amount. There's an accounting team who will keep sending the invoices on a timely manner, right? Then there's a collection team who will keep following up on the payments. When it kicks your band, there's a nature team who will book it in your books and so on, right? And then there's a 3rd like the final thing, which is reporting, which is it goes in your revenue statement in your PNL statement, in your cash flow statement and so on. That's the last terminal part, right? Analyzing and preparing statements. All the work that comes before it, which is collecting all the context spread across people, internal external process systems, and booking it in your books. It's like trying to work. And that is the part we're trying to automatic, right? And it's, sure, your agents can keep learning all the context by integrating with holiday data sources, by the community of slack, emails and so on. But things change. What if the CEO negotiates, it discounts with that customer identity, and nobody knows about it, because it's sitting in your CEO's email it works, right? And then the customer is under paying and the revenue team is shocked. Hey, why are they end up paying? The cash team is shock. Okay, why did, like, why is there like a $1000 difference in the kind that's coming? Now you're chasing people on slack. You're asking, hey, what happened to this customer? And then to pay. But can your platform capture all this context all the time? Keep improving, keep learning the company's policies and process work. That's the end goal, right? The work should just happen across New York. And whatever bandwidth is a lot. The finance skill can use it to analyze the statements and build business systems on top of the company, instead of doing the current work. So that's the broader pieces. So ideally, I mean, just like you say, from the hack of the started, these 24 hours, you're looking for a sickle, like a connector that would one learn for 2 adapt to the situation and also have a lot of context reasoning as well, right? Yes. So either you can take one function. For example, you can take the payroll function or the equity function or the revenue function and go really deep into that. For example, revenue has explained, right? It's about designing the contract, sending of invoices on the timely manner, following up with the customer with email ops, that manual ops work and so on. So you can really go deep into one function and cover all the parts with one or more agents, or you can go cross function. And which you say, I'll automate cash. But my cash agents will also talk to the payroll team, will also talk to the equity team and all the agencies will are aggregated. So that's the more ambitious part, taking more functions on. More realistic is taking one function going deep into it. and Yes, it has to be automized, no human in the loop. The only time a human is pulled in is when the agents really have a blocker in terms of context, you process it further, right? So for example, your CEO thing, yes. That would be where the issue will come and be like. Yes. Be like, hey, I need more information. Why is this happening? And then the CEO holds and says like, hey, this is what you need to do. And it captures that in the memory because every further invoice is also going to have that discount on that customer. So it remembers, hey, this is some team that has been negotiated. So I'm going to remember this called this customer here. Yes. makes sense. I think my dad would be close. That works in finance? Well, he works for engineering services, but he's a sales rep. He's a director of sales. So he's always talking thoughts. like, oh, 80 K is missing. Or like, we negotiated this on this schema threat. Like, how much said that? Exactly. I see what you're talking about. Yeah. And it's all, I mean, I don't want to say non-productive work, but it's unnecessary. too much. Your finance seems to be thinking about like spending their time on, hey, how can I increase this contact with this customer, right? Exactly. What does the customer need? My question is, do you want like more autonomous? So the whole thing you describe for Thomas? like I know similar for in engineering part. Like, it'll create slack, linear and everything, and before a standard will let you know all the issues that have to be discussed, will invite and slack, will DM you all the things. So this is one of the things, but the 2 guys a lot of human loop. Because it will be before standards, before meetings, before end of month. It also has like invoiced and it will send invoice if you are dealing with some client as a starter. So this is kind of like an engineering thing. Same thing. It's like transcribed to like... But you're doing more automons, like... Okay, yes. So it should be, instead of like in engineering, we have like meeting links to standards, anything. This team doesn't exist. It's all agents. So your direct your biggest competitor is the accounting payroll pass, right? So basically it's like for starters who, like, before, like, small start, don't have HR teams, because they are... That's what the either market is. Same like you guys don't want any like finance teams to be there. So simple that even engineers can handle all like Beijing is not able to just go through the Asian's output and be able to use it. Yes. I think it's not going to be the exact thing, though. At least one, I mean, if it has to be the finance team, yes. at the end of the day. It's not like you have to replace a revenue accountant with this agent. That revenue accountant can now do hire all the bit of work, right? Which is like, hey, how do I increase my revenue? Can I talk to the customer? Can you because I have a better revenue model? Can I introduce a new one? Like how engineers are translated from writing code to making the system design and then giving it to the code. But for financial workers. Understood. It makes sense. You mentioned that there is a target audience. I think it is talking. Just now you mentioned, right? Oh, yeah, the target audience is not some small startup who can't afford accounts. All our customers are quite bad, like a familiar and above in revenue. Yeah. Because they have the most complex and distributed finance organic system, right? So that's the target audience. So during the complex, I mean, tedious workflows also. Some cues. At the end of the day, from like a hack on like this, your angle is to see which which idea makes most sense really implement. Yes. Okay. I mean, there's like 3 dimensions we have. One is ambition, which is quite risky, of course. Instead of going deep in one buffalo, can you similar to broader or? The 2nd one is how close you are to the frontier? Are you using the right model, the right partners, the right memory layer and so on? And the 3rd one is how difficult is your process? For example, the cash function is really simple. You get a band statement, you compare it with your books, it's easy. They just become val included as it. Yeah, exactly. Revenue end to end, cash collections, individual. Equity even more difficult because you need to know the laws, how equity works, how the capital works, what's the regulation at the state level, at the federal level. So equity becomes more technically complex, right? Well, then that would require more concepts as well. Yes. Okay. And would that context be in an ideal situation, would that context be vinear across the board, would it be like proprietary based on the company? So there are some things which are definitely common. bounded by law and regulations, but then again, it also depends on then this other tier, which is what kind of vertical you are working in. All the tech companies are going to have similar VPCs sort of pricing of retail pricing, as compared to a retail company or some other manufacturing company. And then the 3rd one is specific to the business itself. They might have their own sort of multi duties. So you ask the keyers of sort of customizations or specifications. That makes sense. It makes sense. Do you have any questions? Whoa. I think I think we're good, but we'll come back. Where are you guys from? I'm from, we just had a cruise up in the Bay Area. I'm from UT Austin. Yeah. I'm free from New York. Oh, wow. from India. N 83 cheap. Oh, that's great. How did this work? How did you tame that? So I, I do tell this, we all do tell Zack bones. Well, I did hack bones like in Calax, like reactive stuff. I met him at Calhacks. So we never really partnered, but we would go to like YC events a lot. And so we met there. And then we met him online and he just had an iPhone across the board. So, you know, that's cool. Yeah. So it seems quite quite fun. Thank you so much. Appreciate it. Bye, go away. All right.
