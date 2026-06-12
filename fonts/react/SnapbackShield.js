export const SnapbackShield = (props) => (
	<svg viewBox="0 0 20 20" {...props} className={`snapback-icons ${props.className ? props.className : ""}`}>
		<path
			d="M8 1L2 3.5v4.75c0 3.13 2.57 6.05 6 6.75 3.43-.7 6-3.62 6-6.75V3.5L8 1zm0 12.9c-2.6-.58-4.5-2.86-4.5-5.65V4.5L8 2.65l4.5 1.85v3.75c0 2.79-1.9 5.07-4.5 5.65z"
			fillRule="evenodd"
		/>
		,
		<path d="M6.5 7.5L5.5 8.5 7.5 10.5 10.5 7.5 9.5 6.5 7.5 8.5z" fillRule="evenodd" />
	</svg>
);
