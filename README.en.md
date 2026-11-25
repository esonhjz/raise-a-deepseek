# Raise a DeepSeek

[简体中文](README.md) | English

An MIT-licensed AI companion project. Start with a minimal persona, then develop her memories, personality, and abilities through everyday conversations, teaching, and building things together. This repository contains reusable modules and offline examples extracted from the project. No npm package has been published.

The project explores how a character can develop through shared experiences, and how those experiences can carry forward into later conversations.

The latest documented [project status](docs/STATUS.md) is a **November 7, 2026 snapshot**: the private companion deployment includes initial emotional continuity, a fix for diary sessions across dates, and weekly reviews with source invalidation checks. Real conversation quality, new automatic generation, and long-term behavior still need validation. The public repository provides a standalone SQLite memory core with transactions, revision conflict protection, and optional FTS5 candidate retrieval. The latest public update documents [weekly reviews](docs/WEEKLY-REVIEW.md) and [recovery](docs/RECOVERY.md); their private runtime code is not included. See the [extraction record](docs/EXTRACTION.md) for scope. Linked design documents are currently in Chinese.

## Three principles

**Start with a minimal persona.** The initial description establishes who she is, how she speaks, and her boundaries. Further characterization should develop through interaction rather than an increasingly elaborate initial prompt.

**Build a relationship through shared activity.** The intended companion can disagree, postpone something, and develop interests of her own. Co-development is part of that relationship: improving a feature together, reading code, or turning an idea into something that runs. These are product goals; the public modules alone do not provide an autonomous companion.

**Remember to continue the conversation.** Keep original records on disk and retrieve a small, relevant portion when needed. Memory should help the next conversation pick up where the previous one left off.

## Quick start

Requires **Node.js 24 or later**. The documented validation environment is Node.js 24.18.1. SQLite uses the built-in `node:sqlite` module; these utilities require no third-party dependencies or model credentials.

From the repository root:

```bash
npm run init          # Create a home at data/home
npm run letter -- --to her --text "Starting today, this is your home."
npm run check         # Check for unread letters in both directions
npm run recall -- --query "home" --key home
npm test              # Run the offline test suite
npm run demo:memory   # Synthetic SQLite persistence, correction, and forgetting demo
npm run check:public  # Scan candidate public files for common sensitive content
```

These commands run local utilities, not a live chat agent. Sending a letter does not automatically create a memory; the recall command queries the separate memory store and can return an empty result.

`npm run init` creates:

```text
data/home/
  letters/          Letters addressed to her
  replies/          Her replies
  room/             Messages left at the door
  diary.md          Diary file
  growth.md         Growth record file
  memory/           Per-contact memory stores
```

The diary and growth files are directory conventions, not automatic writing features. Integrate the modules in `src/` with your own DSH host to connect personas, memories, mailboxes, and time context to an agent.

The SQLite demo uses synthetic data in a temporary directory and cleans up afterward. It does not read real conversations. See the [SQLite memory documentation](docs/SQLITE-MEMORY.md) for integration details and limitations.

## Repository layout

```text
src/
  persona.mjs        Build a system prompt from a persona card
  memory.mjs         JSON memory: candidates, confirmation, replacement, forgetting
  sqlite-memory.mjs  SQLite memory: transactions, revisions, retrieval, shadow callbacks
  internal/         SQLite schema, migration, indexing, and transaction implementation
  archive.mjs        Conversation archive and lexical retrieval
  lane.mjs           Letters, replies, and messages at the door
  home.mjs           Home initialization and directory conventions
  time.mjs           Current date, weekday, and time context
  context.mjs        Handoff across context resets
  lessons.mjs        Teaching tasks, answers, and feedback
  index.mjs          Public exports
scripts/
  init.mjs           Initialize a home
  letter.mjs         Send a letter or leave a message
  check.mjs          Check mailboxes
  recall.mjs         Retrieve memories
examples/
  card.md            A minimal synthetic persona card
  sqlite-memory.mjs  A synthetic demo without model or platform dependencies
tests/               Offline tests; no model calls
```

## How memory works

The public modules separate three responsibilities:

1. **Memory store.** Each entry records one item, its state, and its source. The host or agent decides what to save. Basic retrieval uses lexical overlap, including Chinese character bigrams and English tokens.
2. **Conversation archive.** Exchanges are appended to JSONL. Relevant snippets can be retrieved separately, with a default limit of three records and a 400-character text budget.
3. **Context handoff.** The final three exchanges can be packaged verbatim before a context reset and included when a new context starts.

Basic forgetting and replacement are implemented. The archive is append-only; log compaction, a tombstone index, and long-term multi-character memory remain future work. Hiding a memory from retrieval does not erase its original record.

`SqliteMemoryStore` stores isolated contact records in SQLite, with `superseded` states, transactional mutations, and revision conflict detection. It is a separate API: it does not automatically replace the JSON `MemoryStore` or rewrite an existing `default.json`.

FTS5 provides optional retrieval candidates. Default retrieval remains lexical; there is no claim that FTS5 improves answer quality. Shadow mode compares retrieval results without changing which memories are passed to the model.

## Relationship to DSH

DSH (DeepSeek Harness) supplies model execution, tools, permissions, and sessions. This repository supplies reusable components for the character side:

- Turning persona cards into system prompts
- Storing and retrieving memories
- Exchanging letters through local mailboxes
- Handing off recent conversation across context resets

QQ connectors, desktop-pet interfaces, conversation viewers, and account credentials are outside this repository. A live companion requires your own host integration and model credentials.

## What is available

**In this public repository:**

- Runnable initialization, letter, mailbox, and memory utilities
- Persona, memory, archive, mailbox, time, context, and teaching modules
- A standalone SQLite memory API and synthetic example
- 27 offline tests covering persistence, concurrent writes, stale snapshots, contact isolation, FTS, and shadow comparison
- A minimal persona card and documentation for product goals, architecture, memory, progress, recovery, and extraction boundaries

**In the private companion deployment, as documented on November 7:**

- Natural conversation, media interaction, basic memory, and teaching passed an initial user acceptance round for the scenarios actually tested.
- The diary core has a real generation record. Its cross-date session conflict was fixed; new natural generation after the fix and long-term diary quality remain unverified.
- Initial emotional continuity and weekly reviews are deployed. Weekly reviews check source validity before generation and dependencies before recall, including forgetting regressions. Real expression quality and a naturally generated weekly review still need validation.
- Web information retrieval, ordinary image sending, conservative shared-event capture, and a unified recovery tool are also implemented, with separate validation limits in the [status document](docs/STATUS.md).

These private capabilities are development progress reports, not features shipped in the public package. Public and private test counts are recorded separately.

## What is still missing

- A ready-to-run QQ bot, UI, or QQ/WeChat connector in this repository
- Public implementations of emotional continuity, automatic diaries, weekly reviews, the full experience timeline, web tools, image sending, or unified recovery
- Completed real-world validation of natural event capture, emotional expression, diary quality, weekly generation, and reusable learning from shared development
- Proactive messages, group conversation, and voice interaction
- A published npm package

## Privacy

`data/`, `.local/`, and `.env` are excluded from Git. Keep real persona cards, conversations, account identifiers, credentials, and runtime data out of the public repository. The included persona card and test fixtures are synthetic.

`npm run check:public` checks defined patterns in tracked or otherwise unignored candidate files. It supplements manual review; it cannot establish that every possible form of sensitive information is absent.

## License

Original code and documentation in this repository are licensed under the [MIT License](LICENSE). Third-party dependencies and assets retain their own licenses. The repository license does not grant rights to third-party character artwork or trademarks and does not include private deployment data.

`package.json` retains `private: true` to prevent accidental npm publication. This does not change the repository's MIT license.
