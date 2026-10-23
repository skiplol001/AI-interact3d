using Interact3D.DTOs.Auth;
using Interact3D.DTOs.Common;
using Interact3D.Models;

namespace Interact3D.Services.Interfaces;

public interface IAuthService
{
    Task<ApiResponse<AuthResponse>> AuthenticateAsync(LoginRequest request);
    Task<ApiResponse<AuthResponse>> RegisterAsync(RegisterRequest request);
    Task<tbl_User?> GetByIdAsync(int id);
}