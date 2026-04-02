# AI Elements Migration Guide

## Current Status
- ✅ `components.json` created for shadcn/ui configuration
- ✅ `@ai-sdk/react` already installed and in use
- ⏳ AI Elements registry is currently down (500 errors)
- ⏳ Waiting for registry to come back online

## Installation Steps (When Registry is Back Up)

### Option 1: Use the Installation Script (Recommended)

Run the provided installation script:

```bash
./install-ai-elements.sh
```

This script will install all core AI Elements components automatically.

### Option 2: Manual Installation

Once the registry is working, run these commands manually:

```bash
# Install core AI Elements components
npx ai-elements@latest add conversation --yes
npx ai-elements@latest add message --yes
npx ai-elements@latest add prompt-input --yes

# Optional: Install additional components as needed
npx ai-elements@latest add response --yes  # If available
npx ai-elements@latest add loader --yes     # If available
```

### Alternative: Using shadcn/ui CLI

You can also use the shadcn CLI directly:

```bash
npx shadcn@latest add https://registry.ai-sdk.dev/conversation.json --yes
npx shadcn@latest add https://registry.ai-sdk.dev/message.json --yes
npx shadcn@latest add https://registry.ai-sdk.dev/prompt-input.json --yes
```

**Note:** Components will be installed to `components/ai-elements/` directory by default (as configured in `components.json`).

## Components to Replace

### 1. ChatWindow → Conversation
**Current:** `components/chat/ChatWindow.tsx`
**Replace with:** `components/ai-elements/conversation`

**Migration:**
- Replace `<ChatWindow>` with `<Conversation>`, `<ConversationContent>`, `<ConversationEmptyState>`
- Remove custom scroll logic (handled by `ConversationScrollButton`)
- Remove manual message rendering (handled by `Message` component)

### 2. ChatMessage → Message
**Current:** `components/chat/ChatMessage.tsx`
**Replace with:** `components/ai-elements/message`

**Migration:**
- Replace `<ChatMessage>` with `<Message>` and `<MessageContent>`
- Use `from` prop instead of `role` prop
- Remove custom markdown rendering (handled by `Response` component)

### 3. ChatInput → PromptInput
**Current:** `components/chat/ChatInput.tsx`
**Replace with:** `components/ai-elements/prompt-input`

**Migration:**
- Replace `<ChatInput>` with `<PromptInput>`, `<PromptInputTextarea>`, `<PromptInputSubmit>`
- Simplify submission logic (handled by `useChat` hook)
- Remove custom prompt type selector (can be added as custom prop)

### 4. StreamingMessage → Response
**Current:** `components/chat/StreamingMessage.tsx`
**Replace with:** `components/ai-elements/response` (if available)

**Migration:**
- Replace `<StreamingMessage>` with `<Response>` component
- Streaming is handled automatically by `useChat` hook
- Markdown rendering is built-in

## Key Changes Needed

### In `app/(dashboard)/chat/[threadId]/page.tsx`:

1. **Remove manual message management:**
   - Remove `sessionStorage` message restoration (let `useChat` handle it)
   - Remove manual `setAIMessages` calls
   - Remove duplicate message prevention logic

2. **Simplify `useChat` usage:**
   - Use `initialMessages` prop correctly
   - Let `useChat` handle all message state
   - Use `status` from `useChat` instead of custom `isLoading`

3. **Update imports:**
```typescript
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton
} from '@/components/ai-elements/conversation';
import { Message, MessageContent } from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit
} from '@/components/ai-elements/prompt-input';
```

### In `app/(dashboard)/chat/page.tsx`:

1. **Simplify to use AI Elements:**
   - Use `ConversationEmptyState` for empty state
   - Use `PromptInput` for input

## Benefits After Migration

1. **No more duplicate messages** - `useChat` handles all message state
2. **Automatic streaming** - Assistant responses appear immediately
3. **Built-in markdown rendering** - No need for custom markdown components
4. **Auto-scrolling** - Handled by `ConversationScrollButton`
5. **Consistent UI** - Follows AI Elements design patterns
6. **Less code** - Remove custom scroll logic, message rendering, etc.

## Testing Checklist

After migration, verify:
- [ ] User messages appear immediately (no duplicates)
- [ ] Assistant responses stream correctly
- [ ] Messages persist across page reloads
- [ ] Auto-scrolling works correctly
- [ ] Empty state displays correctly
- [ ] Input submission works correctly
- [ ] Loading states display correctly
- [ ] Markdown renders correctly (code blocks, lists, etc.)

## Next Steps

1. Wait for registry to come back online
2. Run installation commands above
3. Follow migration steps for each component
4. Test thoroughly
5. Remove old custom components once migration is complete
