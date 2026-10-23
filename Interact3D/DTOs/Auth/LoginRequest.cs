using System.ComponentModel.DataAnnotations;

namespace Interact3D.DTOs.Auth;

public class LoginRequest
{
    [Required(ErrorMessage = "Tên đăng nhập không được để trống")]
    public string Username { get; set; } = string.Empty;

    [Required(ErrorMessage = "Mật khẩu không được để trống")]
    public string Password { get; set; } = string.Empty;

    public bool RememberMe { get; set; } = false;
}