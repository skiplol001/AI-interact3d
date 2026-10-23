using Microsoft.EntityFrameworkCore;
using Interact3D.Data;
using Interact3D.DTOs.Auth;
using Interact3D.DTOs.Common;
using Interact3D.Helpers;
using Interact3D.Models;
using Interact3D.Services.Interfaces;

namespace Interact3D.Services;

public class AuthService : IAuthService
{
    private readonly AppDbContext _context;
    private readonly IConfiguration _configuration;

    public AuthService(AppDbContext context, IConfiguration configuration)
    {
        _context = context;
        _configuration = configuration;
    }

    public async Task<ApiResponse<AuthResponse>> AuthenticateAsync(LoginRequest request)
    {
        var user = await _context.tbl_User
            .FirstOrDefaultAsync(u => u.Username == request.Username && !u.IsDeleted);

        if (user == null)
            return ApiResponse<AuthResponse>.Fail("Tài khoản hoặc mật khẩu không chính xác.");

        if (!user.IsActive)
            return ApiResponse<AuthResponse>.Fail("Tài khoản đã bị vô hiệu hóa.");

        if (!PasswordHelper.VerifyPassword(request.Password, user.PasswordHash))
            return ApiResponse<AuthResponse>.Fail("Tài khoản hoặc mật khẩu không chính xác.");

        var token = JwtHelper.GenerateToken(user, _configuration);

        var response = new AuthResponse
        {
            Id = user.Id,
            Username = user.Username,
            DisplayName = user.DisplayName ?? user.Username,
            Role = user.Role,
            Token = token
        };

        return ApiResponse<AuthResponse>.Ok(response, "Đăng nhập thành công.");
    }

    public async Task<ApiResponse<AuthResponse>> RegisterAsync(RegisterRequest request)
    {
        var exists = await _context.tbl_User
            .AnyAsync(u => u.Username.ToLower() == request.Username.ToLower());

        if (exists)
            return ApiResponse<AuthResponse>.Fail("Tên đăng nhập đã tồn tại trong hệ thống.");

        var newUser = new tbl_User
        {
            Username = request.Username.Trim(),
            PasswordHash = PasswordHelper.HashPassword(request.Password),
            DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? request.Username.Trim() : request.DisplayName.Trim(),
            Email = request.Email?.Trim(),
            Role = "User",
            StorageQuotaMB = 500,
            StorageUsedMB = 0,
            IsActive = true,
            IsDeleted = false,
            CreatedAt = DateTime.Now,
            UpdatedAt = DateTime.Now
        };

        _context.tbl_User.Add(newUser);
        await _context.SaveChangesAsync();

        var token = JwtHelper.GenerateToken(newUser, _configuration);

        var response = new AuthResponse
        {
            Id = newUser.Id,
            Username = newUser.Username,
            DisplayName = newUser.DisplayName,
            Role = newUser.Role,
            Token = token
        };

        return ApiResponse<AuthResponse>.Ok(response, "Đăng ký tài khoản thành công.");
    }

    public async Task<tbl_User?> GetByIdAsync(int id)
    {
        return await _context.tbl_User.FindAsync(id);
    }
}   