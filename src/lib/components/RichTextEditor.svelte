<!--
  RichTextEditor - Tiptap-basierter Mini-Editor
  Unterstuetzt: Fett, Unterstrichen, Aufzaehlungsliste, Nummerierte Liste
  Props:
    value (string) - HTML-Inhalt (bind:value)
    placeholder (string) - Platzhaltertext
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
	import History     from '@tiptap/extension-history';

	/** @type {{ value: string, placeholder?: string, tabindex?: number }} */
	let { value = $bindable(''), placeholder = 'Additional details, context, links...', tabindex = 0 } = $props();

	/** @type {HTMLDivElement} */
	let editorEl;
	/** @type {Editor} */
	let editor;

	onMount(() => {
		editor = new Editor({
			element: editorEl,
			extensions: [Document, Paragraph, Text, Bold, Underline, BulletList, OrderedList, ListItem, History],
			content: value || '',
			onUpdate: ({ editor }) => {
				const html = editor.getHTML();
				// Leerer Editor -> leerer String
				value = html === '<p></p>' ? '' : html;
			},
			editorProps: {
				handleKeyDown(view, event) {
					// Tab → fokus auf nächstes Formularfeld weitergeben
					if (event.key === 'Tab' && !event.shiftKey) {
						event.preventDefault();
						const next = document.querySelector(`[tabindex="${tabindex + 1}"]`);
						if (next) /** @type {HTMLElement} */ (next).focus();
						return true;
					}
					return false;
				}
			}
		});
	});

	onDestroy(() => editor?.destroy());

	// Externe value-Aenderung (z.B. Reset) in den Editor spiegeln
	// Nur wenn der Editor nicht fokussiert ist – sonst wird der Cursor zurückgesetzt
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

	// Reaktive Toolbar-Zustaende
	let isBold      = $state(false);
	let isUnderline = $state(false);
	let isBullet    = $state(false);
	let isOrdered   = $state(false);

	onMount(() => {
		editor.on('selectionUpdate', updateToolbar);
		editor.on('transaction',     updateToolbar);
	});

	function updateToolbar() {
		isBold      = editor.isActive('bold');
		isUnderline = editor.isActive('underline');
		isBullet    = editor.isActive('bulletList');
		isOrdered   = editor.isActive('orderedList');
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
			title="Fett (Strg+B)"
		>B</button>

		<button
			type="button"
			tabindex="-1"
			onclick={() => cmd('toggleUnderline')}
			class="toolbar-btn underline {isUnderline ? 'active' : ''}"
			title="Unterstrichen (Strg+U)"
		>U</button>

		<div class="w-px h-4 bg-gray-200 mx-1"></div>

		<button
			type="button"
			tabindex="-1"
			onclick={() => cmd('toggleBulletList')}
			class="toolbar-btn {isBullet ? 'active' : ''}"
			title="Aufzaehlungsliste"
		>&#8226; Liste</button>

		<button
			type="button"
			tabindex="-1"
			onclick={() => cmd('toggleOrderedList')}
			class="toolbar-btn {isOrdered ? 'active' : ''}"
			title="Nummerierte Liste"
		>1. Liste</button>
	</div>

	<!-- Editor-Bereich -->
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		bind:this={editorEl}
		class="rich-editor px-3 py-2 text-sm min-h-[7rem] focus:outline-none"
		data-placeholder={placeholder}
		tabindex={tabindex}
		onfocus={() => editor?.commands.focus()}
	></div>
</div>

<style>
	/* Browser-Outline des contenteditable entfernen */
	.rich-editor :global(.tiptap) { outline: none; }

	/* Listen-Styling */
	.rich-editor :global(ul) { list-style: disc; padding-left: 1.25rem; }
	.rich-editor :global(ol) { list-style: decimal; padding-left: 1.25rem; }
	.rich-editor :global(li) { margin: 0.1rem 0; }
	.rich-editor :global(li > p) { margin: 0; }

	/* Toolbar-Buttons */
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
