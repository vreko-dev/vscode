import { defineComponent, h } from "vue";

export const RiskMedium = defineComponent({
	name: "RiskMedium",
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
				[h("path", { d: "M8 1L1 14h14L8 1zm0 2.5L12.5 13h-9L8 3.5z", fillRule: "evenodd" })],
			);
	},
});
