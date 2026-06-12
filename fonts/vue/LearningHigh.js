import { defineComponent, h } from "vue";

export const LearningHigh = defineComponent({
	name: "LearningHigh",
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
						d: "M8 2C5.8 2 4 3.8 4 6c0 1.5.8 2.8 2 3.5V11h4V9.5c1.2-.7 2-2 2-3.5 0-2.2-1.8-4-4-4zm0 1c1.7 0 3 1.3 3 3 0 1-.5 1.9-1.3 2.5l-.7.5v2H7V9l-.7-.5C5.5 7.9 5 7 5 6c0-1.7 1.3-3 3-3z",
						fillRule: "evenodd",
					}),
					h("path", {
						d: "M8 3c-1.7 0-3 1.3-3 3 0 1 .5 1.9 1.3 2.5l.7.5v2h2V9l.7-.5C10.5 7.9 11 7 11 6c0-1.7-1.3-3-3-3z",
						fillRule: "evenodd",
					}),
				],
			);
	},
});
