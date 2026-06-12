import { defineComponent, h } from "vue";

export const SnapbackRisk = defineComponent({
	name: "SnapbackRisk",
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
					h("path", { d: "M8 1L1 14h14L8 1zm0 2.5L12.5 13h-9L8 3.5z", fillRule: "evenodd" }),
					h("path", { d: "M7.25 6v3.5h1.5V6h-1.5zm0 4.5V12h1.5v-1.5h-1.5z", fillRule: "evenodd" }),
				],
			);
	},
});
