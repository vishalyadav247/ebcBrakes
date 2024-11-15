import React from 'react';
import Box from '@mui/material/Box';
import CustomizedMenus from './Select.components';
// import logo from '../images/ickle.png';
function AppHeader({validUser}) {
    
    const headerWrapperCss = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid silver',
        padding: '10px'
    };
    return (
        <>
            <Box className='header' sx={headerWrapperCss}>
                {/* <img src={logo} alt='' width='180' /> */}
                <div><h3>EBC Brakes</h3></div>
                <CustomizedMenus user={validUser}/>
            </Box>
        </>
    )
}

export default AppHeader;
