export const SnapbackCap = (props) => (
	<svg viewBox="0 0 20 20" {...props} className={`svgfont ${props.className ? props.className : ""}`}>
		<path d="M2 10C2 6 5 3 8 3C11 3 14 6 14 10V11H2V10Z" fillRule="evenodd" />,
		<path
			d="M1.5 11H14.5C14.8 11 15 11.2 15 11.5C15 11.8 14.8 12 14.5 12H1.5C1.2 12 1 11.8 1 11.5C1 11.2 1.2 11 1.5 11Z"
			fillRule="evenodd"
		/>
	</svg>
);
