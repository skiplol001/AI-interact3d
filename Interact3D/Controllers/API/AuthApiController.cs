using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Interact3D.DTOs.Auth;
using Interact3D.DTOs.Common;
using Interact3D.Services.Interfaces;

namespace Interact3D.Controllers.Api;

[ApiController]
[Route("api/[controller]")]
public class AuthApiController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthApiController(IAuthService authService)
    {
        _authService = authService;
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ApiResponse<AuthResponse>.Fail("Dữ liệu gửi lên không hợp lệ."));

        var result = await _authService.AuthenticateAsync(request);
        if (!result.Success)
            return Unauthorized(result);

        return Ok(result);
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ApiResponse<AuthResponse>.Fail("Dữ liệu gửi lên không hợp lệ."));

        var result = await _authService.RegisterAsync(request);
        if (!result.Success)
            return BadRequest(result);

        return Ok(result);
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> GetCurrentUser()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(userIdClaim, out var userId))
            return Unauthorized(ApiResponse<object>.Fail("Token không hợp lệ."));

        var user = await _authService.GetByIdAsync(userId);
        if (user == null || user.IsDeleted)
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy tài khoản người dùng."));

        return Ok(ApiResponse<object>.Ok(new
        {
            user.Id,
            user.Username,
            user.DisplayName,
            user.Email,
            user.Role,
            user.StorageQuotaMB,
            user.StorageUsedMB
        }));
    }
}