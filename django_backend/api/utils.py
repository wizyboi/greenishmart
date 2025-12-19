from rest_framework.response import Response
from rest_framework import status
import logging

logger = logging.getLogger('api')

def api_response(ok=True, message="", data=None, errors=None, status_code=status.HTTP_200_OK):
    """
    Standardize all API responses
    """
    response_data = {
        'ok': ok,
        'message': message,
        'data': data or {},
    }
    if errors:
        response_data['errors'] = errors
        
    return Response(response_data, status=status_code)

def log_error(view_name, error):
    """
    Log errors consistently
    """
    logger.error(f"Error in {view_name}: {str(error)}", exc_info=True)
