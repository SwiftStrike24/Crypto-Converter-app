import React from 'react';
import { Box, Button, Typography, Paper, Theme } from '@mui/material';
import { styled } from '@mui/material/styles';
import { ipcRenderer } from 'electron';

const StyledPaper = styled(Paper)(({ theme }: { theme: Theme }) => ({
  padding: theme.spacing(3),
  maxWidth: 400,
  margin: '0 auto',
  marginTop: theme.spacing(4),
  textAlign: 'center',
  backgroundColor: 'rgba(255, 255, 255, 0.9)',
  backdropFilter: 'blur(10px)',
  borderRadius: theme.spacing(2),
}));

const ButtonContainer = styled(Box)(({ theme }: { theme: Theme }) => ({
  display: 'flex',
  justifyContent: 'center',
  marginTop: theme.spacing(3),
}));

const InstanceDialog: React.FC = () => {
  return (
    <Box sx={{ p: 2, height: '100vh', display: 'flex', alignItems: 'flex-start' }}>
      <StyledPaper elevation={3}>
        <Typography variant="h6" gutterBottom>
          App Already Running
        </Typography>
        <Typography variant="body1" sx={{ mb: 2 }}>
          An instance of Crypto Converter is already running. Click below to restart the app.
        </Typography>
        <ButtonContainer>
          <Button
            variant="contained"
            onClick={() => ipcRenderer.send('instance-dialog-restart')}
            color="primary"
          >
            Restart App
          </Button>
        </ButtonContainer>
      </StyledPaper>
    </Box>
  );
};

export default InstanceDialog; 