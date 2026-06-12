import { defineComponent, h } from "vue";

export const RiskLow = defineComponent({
	name: "RiskLow",
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
				[h("path", { d: "M6.5 8L5.5 9 7 10.5 10.5 7 9.5 6 7 8.5z", fillRule: "evenodd" })],
			);
	},
});
