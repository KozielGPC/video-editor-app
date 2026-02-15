# Contributing to AutoEditor

Thank you for your interest in contributing to AutoEditor! This guide will help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Project Architecture](#project-architecture)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior by opening an issue.

## Getting Started

### 1. Fork the repository

Click the **Fork** button on GitHub, then clone your fork:

```bash
git clone https://github.com/<your-username>/video-editor-app.git
cd video-editor-app
```

### 2. Set up the upstream remote

```bash
git remote add upstream https://github.com/KozielGPC/video-editor-app.git
```

### 3. Install dependencies

Make sure you have all [prerequisites](README.md#prerequisites) installed, then:

```bash
npm install
```

### 4. Create a feature branch

```bash
git checkout -b feat/your-feature-name
```

### 5. Run the app in development mode

```bash
npm run tauri dev
```

## Development Workflow

1. **Sync your fork** with the upstream `main` branch before starting work:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Make your changes** in a feature branch.

3. **Test your changes** manually in the app.

4. **Commit your changes** using the [commit message conventions](#commit-messages).

5. **Push your branch** to your fork:
   ```bash
   git push origin feat/your-feature-name
   ```

6. **Open a Pull Request** against `main` on the upstream repository.

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/). Every commit message should be structured as:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes |
| `style` | Code style changes (formatting, missing semi-colons, etc.) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `build` | Changes to the build system or dependencies |
| `ci` | Changes to CI configuration |
| `chore` | Other changes that don't modify src or test files |

### Scopes

| Scope | Description |
|---|---|
| `editor` | Video editor (timeline, clips, effects) |
| `recorder` | Screen recording |
| `export` | Export functionality |
| `ui` | UI components and styling |
| `backend` | Rust backend / Tauri commands |
| `cli` | Python CLI tool |

### Examples

```
feat(editor): add keyboard shortcut for clip duplication
fix(recorder): resolve crash when no microphone is available
docs: update README with Linux installation steps
refactor(backend): extract silence detection into separate module
```

## Pull Request Process

1. **Fill out the PR template** completely. Describe what your change does and why.
2. **Keep PRs focused** -- one feature or fix per PR. Large PRs are harder to review.
3. **Link related issues** -- use `Closes #123` or `Fixes #123` in the PR description.
4. **Add screenshots or screen recordings** for UI changes.
5. **Make sure the app builds** -- run `npm run tauri build` before submitting.
6. **Respond to review feedback** promptly. We may ask for changes before merging.

### What we look for in reviews

- Code clarity and readability
- Consistent coding style (see [Code Style](#code-style))
- No regressions or broken functionality
- Proper error handling
- TypeScript types are used correctly (no `any`)

## Code Style

### TypeScript / React

- Use **TypeScript** for all frontend code. Avoid `any`.
- Use **functional components** with hooks.
- Use **camelCase** for variables, functions, and methods.
- Use **PascalCase** for components and types.
- Use **kebab-case** for file and directory names.
- Keep components small and focused on a single responsibility.
- Use [Zustand](https://zustand-demo.pmnd.rs/) for state management.
- Use [Radix UI](https://www.radix-ui.com/) primitives for accessible UI components.
- Use [Tailwind CSS](https://tailwindcss.com/) for styling.

### Rust

- Follow standard Rust conventions (`rustfmt`, `clippy`).
- Use `snake_case` for functions and variables.
- Use `PascalCase` for types and structs.
- Handle errors with `Result` -- avoid `unwrap()` in production code.
- Add doc comments (`///`) to public functions and structs.

### Python (CLI tool)

- Follow [PEP 8](https://peps.python.org/pep-0008/).
- Use type annotations for all function signatures.
- Use `dataclasses` for structured data.

## Project Architecture

AutoEditor is a **Tauri 2** application with three main layers:

```
┌─────────────────────────────────────┐
│         Frontend (React/TS)         │
│   Components, Stores, Hooks, UI    │
├─────────────────────────────────────┤
│          Tauri Bridge (IPC)         │
│     Commands, Events, Plugins      │
├─────────────────────────────────────┤
│          Backend (Rust)             │
│  Recording, Editing, FFmpeg, I/O   │
└─────────────────────────────────────┘
```

- **Frontend** (`src/`) -- React app with Zustand stores for state management. Components are organized by feature (editor, recorder, export, overlays, settings).
- **Backend** (`src-tauri/src/`) -- Rust code that handles screen capture, video encoding, FFmpeg operations, silence detection, and file I/O via Tauri commands.
- **CLI** (`autoeditor.py`) -- Standalone Python script for batch silence removal.

### Key directories

| Directory | Purpose |
|---|---|
| `src/components/editor/` | Timeline, toolbar, preview, inspector |
| `src/components/recorder/` | Recording UI, source picker, scenes |
| `src/stores/` | Zustand stores (editor, recorder, settings) |
| `src-tauri/src/commands/` | Tauri command handlers (IPC interface) |
| `src-tauri/src/editor/` | Video editing logic, FFmpeg wrappers |
| `src-tauri/src/recording/` | Screen/audio/camera recording pipeline |

## Reporting Bugs

Use the [Bug Report](https://github.com/KozielGPC/video-editor-app/issues/new?template=bug_report.md) issue template. Include:

- Steps to reproduce
- Expected vs actual behavior
- OS and version
- Screenshots or screen recordings if applicable
- Console errors (if any)

## Requesting Features

Use the [Feature Request](https://github.com/KozielGPC/video-editor-app/issues/new?template=feature_request.md) issue template. Describe:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

---

Thank you for contributing! Every contribution, no matter how small, makes a difference.
