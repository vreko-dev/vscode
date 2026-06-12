import { defineComponent, h } from "vue";

export const SnapbackBrain = defineComponent({
	name: "SnapbackBrain",
	props: {
		class: {
			type: String,
			default: "",
		},
	},
	setup(props, { attrs }) {
		return () =>
			h(
				"svg",
				{
					viewBox: "0 0 20 20",

					class: `svgfont ${props.class}`,
					...attrs,
				},
				[
					h("path", {
						d: "M8 2C5.5 2 3.5 4 3.5 6.5c0 1 .3 1.9.9 2.6-.1.3-.2.6-.2 1 0 1.4 1.1 2.5 2.5 2.5h.8c.3.8 1 1.4 1.9 1.4s1.6-.6 1.9-1.4h.8c1.4 0 2.5-1.1 2.5-2.5 0-.4-.1-.7-.2-1 .6-.7.9-1.6.9-2.6C12.5 4 10.5 2 8 2zm0 1.5c1.7 0 3 1.3 3 3 0 .7-.2 1.3-.6 1.8l-.3.4.2.5c.1.2.2.5.2.8 0 .6-.4 1-1 1h-.8l-.2.6c-.1.4-.5.9-1 .9s-.9-.5-1-.9l-.2-.6h-.8c-.6 0-1-.4-1-1 0-.3.1-.6.2-.8l.2-.5-.3-.4c-.4-.5-.6-1.1-.6-1.8 0-1.7 1.3-3 3-3z",
						fillRule: "evenodd",
					}),
				],
			);
	},
});
