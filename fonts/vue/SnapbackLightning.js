import { defineComponent, h } from "vue";

export const SnapbackLightning = defineComponent({
	name: "SnapbackLightning",
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
				[h("path", { d: "M9.5 1L4 8h3l-1.5 7L12 8H9l.5-7z", fillRule: "evenodd" })],
			);
	},
});
