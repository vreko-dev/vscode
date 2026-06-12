import { defineComponent, h } from "vue";

export const SnapbackRollback = defineComponent({
	name: "SnapbackRollback",
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
						d: "M8 3c-2.8 0-5 2.2-5 5s2.2 5 5 5c1.5 0 2.8-.6 3.8-1.7l-1.1-1.1c-.7.8-1.7 1.3-2.7 1.3-2 0-3.5-1.6-3.5-3.5S6 4.5 8 4.5c1 0 2 .5 2.7 1.3L11.8 4.7C10.8 3.6 9.5 3 8 3z",
						fillRule: "evenodd",
					}),
					h("path", { d: "M10.5 2v3h3l-1.5-1.5L10.5 2z", fillRule: "evenodd" }),
				],
			);
	},
});
