<!--
  RichTextEditor – Tiptap-based mini editor
  Supports: Bold, Underline, Bullet list, Ordered list
  Props:
    value (string) – HTML content (bind:value)
    placeholder (string) – placeholder text
-->
<script>
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import Document    from '@tiptap/extension-document';
	import Paragraph   from '@tiptap/extension-paragraph';
	import Text        from '@tiptap/extension-text';
	import Bold        from '@tiptap/extension-bold';
	import Underline   from '@tiptap/extension-underline';
	import BulletList  from '@tiptap/extension-bullet-list';
	import OrderedList from '@tiptap/extension-ordered-list';
	import ListItem    from '@tiptap/extension-list-item';
	import HardBreak   from '@tiptap/extension-hard-break';
	import History     from '@tiptap/extension-history';
	import { sinkListItem, liftListItem } from 'prosemirror-schema-list';

	/** @type {{ value: string, placeholder?: string, tabindex?: number }} */
	let { value = $bindable(''), placeholder = 'Additional details, context, links...', tabindex = 0 } = $props();

	/** @type {HTMLDivElement} */
	let editorEl;
	/** @type {Editor} */
	let editor;

	onMount(() => {
		editor = new Editor({
			element: editorEl,
			extensions: [Document, Paragraph, Text, Bold, Underline, BulletList, OrderedList, ListItem, HardBreak, History],
			content: value || '',
			onUpdate: ({ editor }) => {
				const html = editor.getHTML();
				// Empty editor → empty string
				value = html === '<p></p>' ? '' : html;
			},
			editorProps: {
				handleKeyDown(view, event) {
					if (event.key !== 'Tab') return false;

					const inList = editor.isActive('listItem');

					if (event.shiftKey) {
						if (inList) {
							// Shift+Tab in list → outdent
							event.preventDefault();
							return liftListItem(view.state.schema.nodes.listItem)(view.state, view.dispatch);
						}
						return false;
					}

					if (inList) {
						// Tab in list → indent
						event.preventDefault();
						return sinkListItem(view.state.schema.nodes.listItem)(view.state, view.dispatch);
					}

					// Tab outside list → next form field
					event.preventDefault();
					const next = document.querySelector(`[tabindex="${tabindex + 1}"]`);
					if (next) /** @type {HTMLElement} */ (next).focus();
					return true;
				}
			}
		});
	});

	onDestroy(() => editor?.destroy());

	// Reflect external value changes (e.g. reset) into the editor
	// Only when the editor is not focused – otherwise the cursor is reset
	$effect(() => {
		if (editor && !editor.isDestroyed && !editor.isFocused) {
			const current = editor.getHTML();
			const next = value || '';
			if (current !== next && !(current === '<p></p>' && next === '')) {
				editor.commands.setContent(next, false);
			}
		}
	});

	function cmd(command) {
		editor?.chain().focus()[command]().run();
	}

	// Reactive toolbar states
	let isBold      = $state(false);
	let isUnderline = $state(false);
	let isBullet    = $state(false);
	let isOrdered   = $state(false);
	let isInList    = $state(false);

	onMount(() => {
		editor.on('selectionUpdate', updateToolbar);
		editor.on('transaction',     updateToolbar);
	});

	function updateToolbar() {
		isBold      = editor.isActive('bold');
		isUnderline = editor.isActive('underline');
		isBullet    = editor.isActive('bulletList');
		isOrdered   = editor.isActive('orderedList');
		isInList    = editor.isActive('listItem');
	}

	function indentList() {
		if (!editor) return;
		const { state, dispatch } = editor.view;
		sinkListItem(state.schema.nodes.listItem)(state, dispatch);
		editor.view.focus();
	}

	function outdentList() {
		if (!editor) return;
		const { state, dispatch } = editor.view;
		liftListItem(state.schema.nodes.listItem)(state, dispatch);
		editor.view.focus();
	}
</script>

<div class="border border-gray-200 rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-ibm-blue">
	<!-- Toolbar -->
	<div class="flex items-center gap-0.5 px-2 py-1 border-b border-gray-200 bg-gray-50">
		<button
			type="button"
			tabindex="-1"
			onclick={() => cmd('toggleBold')}
			class="toolbar-btn font-bold {isBold ? 'active' : ''}"
			title="Bold (Ctrl+B)"
		>B</button>

		<button
			type="button"
			tabindex="-1"
			onclick={() => cmd('toggleUnderline')}
			class="toolbar-btn underline {isUnderline ? 'active' : ''}"
			title="Underline (Ctrl+U)"
		>U</button>

		<div class="w-px h-4 bg-gray-200 mx-1"></div>

		<button
			type="button"
			tabindex="-1"
			onclick={() => cmd('toggleBulletList')}
			class="toolbar-btn {isBullet ? 'active' : ''}"
			title="Bullet list"
		>&#8226; Liste</button>

		<button
			type="button"
			tabindex="-1"
			onclick={() => cmd('toggleOrderedList')}
			class="toolbar-btn {isOrdered ? 'active' : ''}"
			title="Ordered list"
		>1. Liste</button>

		{#if isInList}
			<div class="w-px h-4 bg-gray-200 mx-1"></div>

			<button
				type="button"
				tabindex="-1"
				onclick={outdentList}
				class="toolbar-btn"
				title="Outdent (Shift+Tab)"
			>&#8676;</button>

			<button
				type="button"
				tabindex="-1"
				onclick={indentList}
				class="toolbar-btn"
				title="Indent (Tab)"
			>&#8677;</button>
		{/if}
	</div>

	<!-- Editor area -->
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		bind:this={editorEl}
		class="rich-editor px-3 py-2 text-sm min-h-[14rem] focus:outline-none"
		data-placeholder={placeholder}
		tabindex={tabindex}
		onfocus={() => editor?.commands.focus()}
	></div>
</div>

<style>
	/* Remove browser outline of contenteditable */
	.rich-editor :global(.tiptap) { outline: none; }

	/* List styling */
	.rich-editor :global(ul) { list-style: disc; padding-left: 1.25rem; }
	.rich-editor :global(ol) { list-style: decimal; padding-left: 1.25rem; }
	.rich-editor :global(li) { margin: 0.1rem 0; }
	.rich-editor :global(li > p) { margin: 0; }

	/* Toolbar buttons */
	:global(.toolbar-btn) {
		padding: 0.15rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		color: #57606a;
		transition: background 0.1s, color 0.1s;
		cursor: pointer;
		border: 1px solid transparent;
		background: transparent;
	}
	:global(.toolbar-btn:hover) {
		background: #e5e7eb;
		color: #1f2328;
	}
	:global(.toolbar-btn.active) {
		background: #dbeafe;
		color: #1d4ed8;
		border-color: #bfdbfe;
	}
</style>
